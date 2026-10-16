import type { BridgeFailure, IoMappingResponse } from "@pantin/protocol";
import { afterEach } from "vitest";
import { type BridgeSupervisor, createBridgeSupervisor } from "../bridge/bridge-supervisor.ts";
import { createFakeSpawner, type FakeSpawner } from "./fake-bridge-child.ts";

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
      port,
      unitId: 1,
      wordOrder: "low_word_first",
      watchdogMilliseconds: 1000,
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
  busFacts: { bridgeConnected: boolean; plcConnectedModules: Set<string> };
};

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
  const busFacts = { bridgeConnected: false, plcConnectedModules: new Set<string>() };
  const supervisor = createBridgeSupervisor({
    pythonPath: options.pythonPath === null ? undefined : (options.pythonPath ?? PYTHON),
    spawn: spawner.spawn,
    service: {
      readIo: async (pantinId) => mappingWith(pantinId === "second" ? [1503] : [1502]),
      peekBridgeBusFacts: () => busFacts,
      recordBridgeFailure: async (_pantinId, failure) => {
        failures.push(failure);
      },
    },
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
  return { supervisor, spawner, changes, failures, mirrored, busFacts };
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
