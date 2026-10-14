import type { BridgeNetwork, BridgeStatus } from "@pantin/protocol";
import type { BridgeMachineState } from "./bridge-state.ts";

// The BridgeStatus a client sees (ADR 0050 point 5), built from the machine
// state and the facts the bus holds. Pure.

type SupervisedBridgeView = {
  state: BridgeMachineState;
  network: BridgeNetwork | null;
  log: readonly string[];
};

export type BridgeStatusInput = {
  availability: BridgeStatus["availability"];
  // Undefined for a Pantin whose bridge was never started.
  view: SupervisedBridgeView | undefined;
  bus: { bridgeConnected: boolean; plcConnectedModules: ReadonlySet<string> };
  listenChoices: readonly string[];
};

export function buildBridgeStatus(input: BridgeStatusInput): BridgeStatus {
  const { view, bus } = input;
  const state: BridgeMachineState = view?.state ?? { phase: "stopped" };
  const isSupervised = state.phase !== "stopped" && state.phase !== "failed";
  return {
    availability: input.availability,
    state: state.phase,
    network: view?.network ?? null,
    modules:
      state.phase === "running"
        ? state.modules.map(({ key, port }) => ({
            key,
            port,
            plcConnected: bus.plcConnectedModules.has(key),
          }))
        : [],
    failure: state.phase === "failed" ? state.failure : null,
    log: [...(view?.log ?? [])],
    // Just after a stop the bus close may not be processed yet, so this reads
    // true for a moment; a retry shows the real state.
    // While Pantin holds a child of its own, the bus connection is that child's.
    externalBridgeConnected: bus.bridgeConnected && !isSupervised,
    listenChoices: [...input.listenChoices],
  };
}
