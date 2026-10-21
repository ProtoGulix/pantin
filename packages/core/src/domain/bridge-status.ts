import {
  type BridgeClientCertificate,
  type BridgeModuleStatus,
  type BridgeNetwork,
  type BridgeStatus,
  MODBUS_TCP_SLAVE_KIND,
  OPCUA_CLIENT_KIND,
  type PlcModuleLossReason,
  type TransportKind,
} from "@pantin/protocol";
import type { BridgeMachineState } from "./bridge-state.ts";

// The BridgeStatus a client sees (ADR 0050 point 5, ADR 0065 point 7), built from the
// machine state and the facts the bus holds. Pure. The status is a union on the kind,
// since `network` and `listenChoices` differ: this file and bridge-kinds.ts are where the
// core names kinds for that reason.

/** What the PLC side of one module reported with `plc_status`. */
export type PlcModuleState =
  | { connected: true }
  | { connected: false; reason: PlcModuleLossReason };

/** The bus side of one kind's bridge, for one Pantin. */
export type BridgeBusFacts = {
  // A bridge of this kind holds the Pantin's `plc` slot for it.
  bridgeConnected: boolean;
  // By module key; a module that never reported is absent.
  plcModules: ReadonlyMap<string, PlcModuleState>;
};

type SupervisedBridgeView = {
  state: BridgeMachineState;
  network: BridgeNetwork | null;
  clientCertificate: BridgeClientCertificate | null;
  log: readonly string[];
};

export type BridgeStatusInput = {
  kind: TransportKind;
  availability: BridgeStatus["availability"];
  // Undefined for a Pantin whose bridge of this kind was never started.
  view: SupervisedBridgeView | undefined;
  bus: BridgeBusFacts;
  // Used by the kind that listens only.
  listenChoices: readonly string[];
};

function moduleStatusesOf(state: BridgeMachineState, bus: BridgeBusFacts): BridgeModuleStatus[] {
  if (state.phase !== "running") {
    return [];
  }
  return state.modules.map(({ key, endpoint }) => {
    const plc = bus.plcModules.get(key);
    return {
      key,
      endpoint,
      plcConnected: plc?.connected ?? false,
      reason: plc === undefined || plc.connected ? null : plc.reason,
    };
  });
}

export function buildBridgeStatus(input: BridgeStatusInput): BridgeStatus {
  const { view, bus } = input;
  const state: BridgeMachineState = view?.state ?? { phase: "stopped" };
  const isSupervised = state.phase !== "stopped" && state.phase !== "failed";
  const common = {
    availability: input.availability,
    state: state.phase,
    modules: moduleStatusesOf(state, bus),
    failure: state.phase === "failed" ? state.failure : null,
    log: [...(view?.log ?? [])],
    // Just after a stop the bus close may not be processed yet, so this reads
    // true for a moment; a retry shows the real state.
    // While Pantin holds a child of its own, the bus connection is that child's.
    externalBridgeConnected: bus.bridgeConnected && !isSupervised,
  };
  const network = view?.network ?? null;
  if (input.kind === OPCUA_CLIENT_KIND) {
    return {
      transport: OPCUA_CLIENT_KIND,
      ...common,
      network: network !== null && "targets" in network ? network : null,
      clientCertificate: view?.clientCertificate ?? null,
    };
  }
  return {
    transport: MODBUS_TCP_SLAVE_KIND,
    ...common,
    network: network !== null && "listen" in network ? network : null,
    listenChoices: [...input.listenChoices],
  };
}
