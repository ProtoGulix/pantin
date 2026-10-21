import type { BridgeFailure, IoMappingResponse, TransportKind } from "@pantin/protocol";
import { afterEach } from "vitest";
import { createBridgeLogFile } from "../bridge/bridge-log-file.ts";
import {
  type BridgeLauncher,
  type BridgeSupervisor,
  type BridgeSupervisorOptions,
  createBridgeSupervisor,
} from "../bridge/bridge-supervisor.ts";
import { createPasswordStore, type PasswordStore } from "../bridge/opcua-passwords.ts";
import type { PlcModuleState } from "../domain/bridge-status.ts";
import { createFakeSpawner, type FakeSpawner } from "./fake-bridge-child.ts";
import { createMemoryLogFileSystem, type MemoryLogFileSystem } from "./memory-log-file-system.ts";
import { createOpcuaTransport } from "./opcua-transport.ts";

// A supervisor over a fake spawner and a fake service, for its tests.

export const MODBUS = "modbus_tcp_slave";
export const OPCUA = "opcua_client";
export const PYTHON = "/venv/bin/python";
export const OPCUA_ENTRY = "/opcua-bridge/main.ts";
export const READY = JSON.stringify({
  event: "ready",
  transport: MODBUS,
  listen: "127.0.0.1",
  modules: [{ key: "m1", port: 1502 }],
});
export const OPCUA_READY = JSON.stringify({
  event: "ready",
  transport: OPCUA,
  modules: [{ key: "plc", endpoint: "opc.tcp://127.0.0.1:4840" }],
  clientCertificate: {
    subject: "CN=Pantin",
    applicationUri: "urn:pantin:test:opcua-bridge",
    sha256: "c".repeat(64),
    sha1: "d".repeat(40),
  },
});

// A user module is secured, as the core demands for a login toward a lan target.
function opcuaMapping(withUser: boolean): IoMappingResponse {
  const transport = withUser
    ? {
        ...createOpcuaTransport(),
        securityMode: "SignAndEncrypt" as const,
        securityPolicy: "Basic256Sha256" as const,
        auth: { kind: "user" as const, userName: "operator" },
      }
    : createOpcuaTransport();
  return {
    status: "valid",
    mappingId: "def",
    modules: [{ key: "plc", transport, channels: [] }],
    problems: [],
    unmappedTags: [],
  };
}

function mappingWith(ports: number[]): IoMappingResponse {
  return {
    status: "valid",
    mappingId: "abc",
    modules: ports.map((port, index) => ({
      key: `m${index + 1}`,
      transport: {
        kind: "modbus_tcp_slave",
        port,
        unitId: 1,
        wordOrder: "low_word_first",
        watchdogMilliseconds: 1000,
      },
      channels: [],
    })),
    problems: [],
    unmappedTags: [],
  };
}

export type Bench = {
  supervisor: BridgeSupervisor;
  spawner: FakeSpawner;
  changes: string[];
  failures: BridgeFailure[];
  mirrored: string[];
  // The bridge log files, and the messages sent to the Pantin console.
  logFiles: MemoryLogFileSystem;
  consoleMessages: string[];
  // The modules named by each `opcua_unsecured_lan` warning request.
  unsecuredLanWarnings: string[][];
  logWriteFailures: unknown[];
  // What the bus holds, per kind; the tests change it, then call `refresh`.
  busFacts: Record<TransportKind, BusFacts>;
  passwordStore: PasswordStore;
};

type BusFacts = { bridgeConnected: boolean; plcModules: Map<string, PlcModuleState> };

function fakeService(records: {
  failures: BridgeFailure[];
  consoleMessages: string[];
  unsecuredLanWarnings: string[][];
  busFacts: Bench["busFacts"];
  opcuaWithUser: boolean;
}): BridgeSupervisorOptions["service"] {
  const { failures, consoleMessages, unsecuredLanWarnings, busFacts } = records;
  return {
    readIo: async (pantinId, kind) =>
      kind === OPCUA
        ? opcuaMapping(records.opcuaWithUser)
        : mappingWith(pantinId === "second" ? [1503] : [1502]),
    peekBridgeBusFacts: (_pantinId, kind) => busFacts[kind],
    recordBridgeFailure: async (_pantinId, failure) => {
      failures.push(failure);
    },
    recordBridgeLog: async (_pantinId, message) => {
      consoleMessages.push(message);
    },
    recordOpcuaUnsecuredLan: async (_pantinId, modules) => {
      unsecuredLanWarnings.push(modules);
    },
  };
}

function launchersOf(options: { pythonPath?: string | null; withOpcua?: boolean }) {
  const launchers: BridgeLauncher[] = [];
  if (options.pythonPath !== null) {
    launchers.push({
      kind: MODBUS,
      command: options.pythonPath ?? PYTHON,
      args: ["-I", "-u", "-m", "pantin_bridge"],
    });
  }
  if (options.withOpcua === true) {
    launchers.push({
      kind: OPCUA,
      command: "/node",
      args: [OPCUA_ENTRY],
      hostArguments: ["--pki-dir", "/pki"],
      environment: { PATH: "/bin" },
    });
  }
  return launchers;
}

export function bench(
  options: {
    exitsOnSigterm?: boolean;
    // The Modbus launcher's command; null for a core started without --bridge-python.
    pythonPath?: string | null;
    // Gives the core a launcher for the OPC UA client too.
    withOpcua?: boolean;
    // Its only module logs in with a user name (anonymous by default).
    opcuaWithUser?: boolean;
    timeoutMs?: number;
    killGraceMs?: number;
  } = {},
): Bench {
  const spawner = createFakeSpawner({ exitsOnSigterm: options.exitsOnSigterm ?? true });
  const changes: string[] = [];
  const failures: BridgeFailure[] = [];
  const mirrored: string[] = [];
  const logFiles = createMemoryLogFileSystem();
  const consoleMessages: string[] = [];
  const unsecuredLanWarnings: string[][] = [];
  const logWriteFailures: unknown[] = [];
  const busFacts = {
    [MODBUS]: { bridgeConnected: false, plcModules: new Map() },
    [OPCUA]: { bridgeConnected: false, plcModules: new Map() },
  } satisfies Bench["busFacts"];
  const passwordStore = createPasswordStore();
  const supervisor = createBridgeSupervisor({
    launchers: launchersOf(options),
    spawn: spawner.spawn,
    service: fakeService({
      failures,
      consoleMessages,
      unsecuredLanWarnings,
      busFacts,
      opcuaWithUser: options.opcuaWithUser ?? false,
    }),
    logFile: createBridgeLogFile({
      logsDirectory: "/logs",
      fileSystem: logFiles,
      now: () => new Date("2026-10-17T10:00:00.000Z"),
      reportWriteFailure: (error) => logWriteFailures.push(error),
    }),
    coreAddress: () => ({ host: "127.0.0.1", port: 4800 }),
    hostAddresses: () => ["127.0.0.1", "192.168.1.20"],
    mirrorLogLine: (_pantinId, line) => mirrored.push(line),
    onChange: (pantinId) => changes.push(pantinId),
    reportError: (error) => {
      throw error;
    },
    passwordStore,
    startTimeoutMs: options.timeoutMs ?? 5000,
    killGraceMs: options.killGraceMs ?? 20,
  });
  return {
    supervisor,
    spawner,
    changes,
    failures,
    mirrored,
    logFiles,
    consoleMessages,
    unsecuredLanWarnings,
    logWriteFailures,
    busFacts,
    passwordStore,
  };
}

export const LOCAL = { kind: MODBUS, listen: "127.0.0.1", allow: [] } as const;
export const OPCUA_START = {
  kind: OPCUA,
  targets: { plc: "127.0.0.1" },
  passwords: {},
  trust: [],
  viaExposure: false,
} as const;
export const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

// Registers the cleanup: every bench started through `started` is closed after the test.
export function useBridgeBenches() {
  let current: Bench | undefined;
  afterEach(async () => {
    await current?.supervisor.close();
    current = undefined;
  });
  function started(options: Parameters<typeof bench>[0] = {}): Bench {
    current = bench(options);
    return current;
  }
  async function runningBridge(): Promise<Bench> {
    const testBench = started();
    await testBench.supervisor.start("axis", LOCAL);
    testBench.spawner.children[0]?.writeStdout(`${READY}\n`);
    await tick();
    return testBench;
  }
  return { started, runningBridge };
}
