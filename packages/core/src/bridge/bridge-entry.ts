import type { BridgeNetwork } from "@pantin/protocol";
import {
  type BridgeExitingLine,
  type BridgeMachineState,
  INITIAL_BRIDGE_STATE,
} from "../domain/bridge-state.ts";
import type { BridgeProcess } from "./bridge-process.ts";

// What the supervisor knows of one Pantin's bridge (ADR 0050).

export type Entry = {
  state: BridgeMachineState;
  network: BridgeNetwork | null;
  log: string[];
  // Changes at each start, so that a late event of an old child is ignored.
  generation: number;
  process: BridgeProcess | undefined;
  exiting: BridgeExitingLine | undefined;
  startTimer: NodeJS.Timeout | undefined;
  ports: number[];
};

export function newEntry(): Entry {
  return {
    state: INITIAL_BRIDGE_STATE,
    network: null,
    log: [],
    generation: 0,
    process: undefined,
    exiting: undefined,
    startTimer: undefined,
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
