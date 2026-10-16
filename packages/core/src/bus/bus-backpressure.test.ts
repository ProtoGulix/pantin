import { describe, expect, it } from "vitest";
import { resolveNetworkConfig } from "../domain/network-config.ts";
import { createPantinDocument } from "../domain/pantin-document.ts";
import { fakeMappingSource } from "../test-support/fake-io-mapping.ts";
import { createManualTimer } from "../test-support/manual-timer.ts";
import { createBusRegistry } from "./bus-registry.ts";
import type { BusService } from "./bus-session.ts";
import type { BusSocket } from "./bus-socket.ts";

// A peer that stops reading is closed once the core has buffered 1 MiB for it.

const CLOCK = {
  running: true,
  step: 0,
  stepSeconds: 1 / 120,
  achievedRatio: null,
  droppedSteps: 0,
};

const SERVICE = {
  peekFeedSource: () => ({
    stepCount: 0,
    document: createPantinDocument("Axis"),
    resetCount: 0,
    consoleId: "c",
    consoleLastSequence: 0,
    readConsole: () => [],
    clock: CLOCK,
    tags: () => [],
  }),
} as unknown as BusService; // Only peekFeedSource is reached by a client hello.

async function helloWithBuffered(bufferedBytes: number): Promise<number[]> {
  const network = resolveNetworkConfig("127.0.0.1");
  if (!network.ok) {
    throw new Error(network.message);
  }
  const closes: number[] = [];
  const socket: BusSocket = {
    send: () => undefined,
    close: (code) => closes.push(code),
    ping: () => undefined,
    terminate: () => undefined,
    bufferedAmount: () => bufferedBytes,
  };
  const registry = createBusRegistry({
    service: SERVICE,
    network: network.config,
    mappingSource: fakeMappingSource([]),
    timer: createManualTimer().timer,
    reportError: (error) => {
      throw error;
    },
  });
  registry
    .attach(socket, { pantinId: "axis", remoteAddress: "127.0.0.1" })
    ?.receive(JSON.stringify({ type: "hello", version: 1, role: "client" }), false);
  await new Promise((resolve) => setImmediate(resolve));
  registry.closeAll();
  return closes;
}

describe("output ceiling", () => {
  it("closes with 1008 a connection with more than 1 MiB unread", async () => {
    expect(await helloWithBuffered(1024 * 1024 + 1)).toEqual([1008]);
  });

  it("keeps a connection at the ceiling", async () => {
    expect(await helloWithBuffered(1024 * 1024)).toEqual([]);
  });
});
