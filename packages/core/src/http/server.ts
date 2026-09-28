import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { MAX_IMPORT_BYTES } from "@pantin/protocol";
import type { ProcessLimits } from "../converter/process-runner.ts";
import { createStepConverter, type StepConverter } from "../converter/step-converter.ts";
import {
  isSourceAccepted,
  type NetworkConfig,
  resolveNetworkConfig,
} from "../domain/network-config.ts";
import { createPantinService } from "../service/pantin-service.ts";
import { createPantinStore } from "../store/pantin-store.ts";
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
  stepConverterLimits?: Partial<ProcessLimits>;
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

export async function startPantinServer(
  options: PantinServerOptions,
): Promise<RunningPantinServer> {
  const result = resolveNetworkConfig(options.listen, options.allow);
  if (!result.ok) {
    throw new StartupRefusedError(result.message);
  }
  const network = result.config;
  const server = createServer(
    createRequestHandler({
      service: createPantinService(
        createPantinStore(options.pantinsDirectory),
        createConfiguredStepConverter(options),
      ),
      network,
      maxImportBytes: options.maxImportBytes ?? MAX_IMPORT_BYTES,
      viewerDirectory: options.viewerDirectory,
      reportError: options.reportError,
    }),
  );
  installSourceFilter(server, options, network);
  await listen(server, options.port, network.listenAddress);
  // listen() on a TCP host and port always yields an AddressInfo, never a string.
  const address = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
      server.closeAllConnections();
    });
  return { server, address, network, close };
}
