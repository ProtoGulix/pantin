import type {
  BridgeClientCertificate,
  BridgeNetwork,
  PantinId,
  TransportKind,
} from "@pantin/protocol";
import {
  type BridgeExitingLine,
  type BridgeMachineState,
  INITIAL_BRIDGE_STATE,
} from "../domain/bridge-state.ts";
import type { BridgeProcess } from "./bridge-process.ts";

// What the supervisor knows of one (Pantin, kind) bridge (ADR 0050, ADR 0065 point 5).

export type Entry = {
  pantinId: PantinId;
  kind: TransportKind;
  state: BridgeMachineState;
  network: BridgeNetwork | null;
  // OPC UA only: from the last `ready` line, kept after a stop or a failure.
  clientCertificate: BridgeClientCertificate | null;
  log: string[];
  // Changes at each start, so that a late event of an old child is ignored.
  generation: number;
  process: BridgeProcess | undefined;
  exiting: BridgeExitingLine | undefined;
  startTimer: NodeJS.Timeout | undefined;
  // What it holds while active: the address it listens on (null when it connects out)
  // and its ports (none then either).
  listen: string | null;
  ports: number[];
};

export function newEntry(pantinId: PantinId, kind: TransportKind): Entry {
  return {
    pantinId,
    kind,
    state: INITIAL_BRIDGE_STATE,
    network: null,
    clientCertificate: null,
    log: [],
    generation: 0,
    process: undefined,
    exiting: undefined,
    startTimer: undefined,
    listen: null,
    ports: [],
  };
}

export function isActive(entry: Entry): boolean {
  // A child still alive counts, also after a start timeout made the state
  // `failed`: it may still hold its ports and its slot.
  const { phase } = entry.state;
  return (
    entry.process !== undefined ||
    phase === "starting" ||
    phase === "running" ||
    phase === "stopping"
  );
}
