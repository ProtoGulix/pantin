import type { BridgeFailure, IoMappingResponse } from "@pantin/protocol";
import { afterEach } from "vitest";
import { createBridgeLogFile } from "../bridge/bridge-log-file.ts";
import {
  type BridgeSupervisor,
  type BridgeSupervisorOptions,
  createBridgeSupervisor,
} from "../bridge/bridge-supervisor.ts";
import { createFakeSpawner, type FakeSpawner } from "./fake-bridge-child.ts";
import { createMemoryLogFileSystem, type MemoryLogFileSystem } from "./memory-log-file-system.ts";

// A supervisor over a fake spawner and a fake service, for its tests.

export const PYTHON = "/venv/bin/python";
export const READY = JSON.stringify({
  event: "ready",
  listen: "127.0.0.1",
  modules: [{ key: "m1", port: 1502 }],
});

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
  logWriteFailures: unknown[];
  busFacts: { bridgeConnected: boolean; plcConnectedModules: Set<string> };
};

function fakeService(records: {
  failures: BridgeFailure[];
  consoleMessages: string[];
  busFacts: Bench["busFacts"];
}): BridgeSupervisorOptions["service"] {
  const { failures, consoleMessages, busFacts } = records;
  return {
    readIo: async (pantinId) => mappingWith(pantinId === "second" ? [1503] : [1502]),
    peekBridgeBusFacts: () => busFacts,
    recordBridgeFailure: async (_pantinId, failure) => {
      failures.push(failure);
    },
    recordBridgeLog: async (_pantinId, message) => {
      consoleMessages.push(message);
    },
  };
}

export function bench(
  options: {
    exitsOnSigterm?: boolean;
    pythonPath?: string | null;
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
  const logWriteFailures: unknown[] = [];
  const busFacts = { bridgeConnected: false, plcConnectedModules: new Set<string>() };
  const supervisor = createBridgeSupervisor({
    pythonPath: options.pythonPath === null ? undefined : (options.pythonPath ?? PYTHON),
    spawn: spawner.spawn,
    service: fakeService({ failures, consoleMessages, busFacts }),
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
    logWriteFailures,
    busFacts,
  };
}

export const LOCAL = { listen: "127.0.0.1", allow: [] };
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
