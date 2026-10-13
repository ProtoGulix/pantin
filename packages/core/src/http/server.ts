import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { MAX_IMPORT_BYTES } from "@pantin/protocol";
import { type BusEndpoint, createBusEndpoint } from "../bus/bus-endpoint.ts";
import type { ProcessLimits } from "../converter/process-runner.ts";
import { createStepConverter, type StepConverter } from "../converter/step-converter.ts";
import type { IoMappingSource } from "../domain/io-mapping.ts";
import {
  isSourceAccepted,
  type NetworkConfig,
  resolveNetworkConfig,
} from "../domain/network-config.ts";
import type { PhysicsWorldFactory } from "../domain/physics-world.ts";
import { serviceMappingSource } from "../service/io-operations.ts";
import {
  createPantinService,
  type PantinService,
  type ServiceOptions,
} from "../service/pantin-service.ts";
import {
  createRealSimulationTimer,
  type SimulationTick,
  type SimulationTimer,
  startSimulationLoop,
} from "../service/simulation-loop.ts";
import { createPantinStore } from "../store/pantin-store.ts";
import {
  createPoseStreamRegistry,
  type PoseSource,
  type PoseStreamRegistry,
} from "./pose-stream-registry.ts";
import { createRequestHandler } from "./request-handler.ts";

export type PantinServerOptions = {
  pantinsDirectory: string;
  port: number;
  // Listen address (ADR 0004, ADR 0008): loopback by default, else one private address.
  listen?: string;
  // IPs or CIDRs that narrow the accepted connection sources.
  allow?: readonly string[];
  // Built viewer to serve next to /api (ADR 0008).
  viewerDirectory?: string;
  maxImportBytes?: number;
  // Python interpreter of the STEP converter's environment (ADR 0009); without
  // it, STEP imports answer conversion_unavailable.
  stepConverterPython?: string;
  // The physics engine (ADR 0043 point 9); main.ts loads Rapier and passes it.
  physicsWorldFactory?: PhysicsWorldFactory;
  stepConverterLimits?: Partial<ProcessLimits>;
  // Clock of the fixed-step loop (ADR 0012); the real one by default.
  simulationTimer?: SimulationTimer;
  // Wall clock of the console entries (ADR 0031); the real one by default.
  wallClock?: () => Date;
  // Makes the id of each console (ADR 0031); random by default.
  newConsoleId?: () => string;
  // Clock of the pose streams' keep-alive comments (ADR 0015); the real one by default.
  streamTimer?: SimulationTimer;
  // Clock of the tag bus: pings, pongs and the hello deadline (ADR 0045 point 4);
  // the real one by default.
  busTimer?: SimulationTimer;
  // Replaces the Pantins' I/O mappings (ADR 0045 point 7), which the core reads
  // from io.csv and io-modules.json by default; tests of the bus give fakes.
  ioMappingSource?: IoMappingSource;
  // Receives unexpected errors (the client only gets a generic message).
  reportError: (error: unknown) => void;
  // Receives the source address of every connection closed by the filter.
  reportRejectedSource: (source: string) => void;
};

export type RunningPantinServer = {
  server: Server;
  address: AddressInfo;
  network: NetworkConfig;
  close(): Promise<void>;
};

// Thrown before any socket is opened when the network options are unsafe.
export class StartupRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupRefusedError";
  }
}

// Registered before Node's own HTTP listener, and destroying synchronously:
// a rejected socket is closed before a single byte of it is read.
function installSourceFilter(server: Server, options: PantinServerOptions, network: NetworkConfig) {
  server.prependListener("connection", (socket: Socket) => {
    if (!isSourceAccepted(network, socket.remoteAddress)) {
      socket.destroy();
      options.reportRejectedSource(socket.remoteAddress ?? "unknown");
    }
  });
}

function createConfiguredStepConverter(options: PantinServerOptions): StepConverter | undefined {
  if (options.stepConverterPython === undefined) {
    return undefined;
  }
  return createStepConverter({
    pythonPath: options.stepConverterPython,
    spawn,
    reportDetail: (detail) => options.reportError(new Error(detail)),
    ...(options.stepConverterLimits === undefined ? {} : { limits: options.stepConverterLimits }),
  });
}

function listen(server: Server, port: number, address: string): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, address, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function poseSourceOf(service: PantinService): PoseSource {
  return {
    stepCount: service.peekStepCount,
    snapshot: service.peekPoseSnapshot,
    clock: service.peekClock,
    isRunning: service.peekIsRunning,
  };
}

function serviceOptionsOf(options: PantinServerOptions): ServiceOptions {
  return {
    // Without it the service falls back to an inert world: for tests that run
    // without Rapier only; main.ts always passes the real one.
    ...(options.physicsWorldFactory === undefined
      ? {}
      : { physicsWorldFactory: options.physicsWorldFactory }),
    ...(options.wallClock === undefined ? {} : { wallClock: options.wallClock }),
    ...(options.newConsoleId === undefined ? {} : { newConsoleId: options.newConsoleId }),
    reportStepError: options.reportError,
  };
}

function busEndpointOf(
  options: PantinServerOptions,
  network: NetworkConfig,
  service: PantinService,
) {
  return createBusEndpoint({
    service,
    network,
    mappingSource: options.ioMappingSource ?? serviceMappingSource(service),
    timer: options.busTimer ?? createRealSimulationTimer(),
    reportError: options.reportError,
  });
}

// One scheduler tick: the steps, then what the streams and the bus tell their clients of them.
function runTick(
  tick: SimulationTick,
  parts: { service: PantinService; poseStreams: PoseStreamRegistry; bus: BusEndpoint },
): void {
  parts.service.runSimulationSteps(tick);
  parts.poseStreams.notifyTick();
  parts.bus.notifyTick();
}

// `stopWork` releases what runs inside the server before its connections are cut.
function closeServer(server: Server, stopWork: () => void): Promise<void> {
  return new Promise<void>((resolveClose, rejectClose) => {
    stopWork();
    server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
    server.closeAllConnections();
  });
}

export async function startPantinServer(
  options: PantinServerOptions,
): Promise<RunningPantinServer> {
  const result = resolveNetworkConfig(options.listen, options.allow);
  if (!result.ok) {
    throw new StartupRefusedError(result.message);
  }
  const network = result.config;
  const service = createPantinService(
    createPantinStore(options.pantinsDirectory),
    createConfiguredStepConverter(options),
    serviceOptionsOf(options),
  );
  const poseStreams = createPoseStreamRegistry({
    source: poseSourceOf(service),
    timer: options.streamTimer ?? createRealSimulationTimer(),
  });
  const server = createServer(
    createRequestHandler({
      service,
      poseStreams,
      network,
      maxImportBytes: options.maxImportBytes ?? MAX_IMPORT_BYTES,
      viewerDirectory: options.viewerDirectory,
      reportError: options.reportError,
    }),
  );
  const bus = busEndpointOf(options, network, service);
  server.on("upgrade", (request, socket, head) => bus.handleUpgrade(request, socket, head));
  installSourceFilter(server, options, network);
  await listen(server, options.port, network.listenAddress);
  const loop = startSimulationLoop(
    options.simulationTimer ?? createRealSimulationTimer(),
    (tick) => runTick(tick, { service, poseStreams, bus }),
    options.reportError,
  );
  // listen() on a TCP host and port always yields an AddressInfo, never a string.
  const address = server.address() as AddressInfo;
  const close = () =>
    closeServer(server, () => {
      loop.stop();
      poseStreams.closeAll();
      bus.closeAll();
      service.close();
    });
  return { server, address, network, close };
}
