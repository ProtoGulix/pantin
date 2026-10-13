// Write sources and forced tags (ADR 0045 point 5, ADR 0031 point 6): the
// runtime state kept for each command tag, and the pure decisions on it. The
// values themselves stay where the simulation reads them (setpoints, drive
// commands, spawn values): this only says whether a write applies.

export type WriteSource = "client" | "plc";

export type TagState = {
  // A client wrote the tag and nobody released it since.
  forced: boolean;
  // Whose write the current value comes from; null while nobody wrote it.
  lastSource: WriteSource | null;
  // The last value the PLC wrote, also while it was ignored: a release applies it.
  plcValue: number | null;
};

export type TagStates = Map<string, TagState>;

export const UNWRITTEN_TAG_STATE: TagState = { forced: false, lastSource: null, plcValue: null };

export type WriteDecision = {
  state: TagState;
  // False when the write must not reach the simulation: a PLC write on a forced tag.
  applied: boolean;
};

export function decideWrite(state: TagState, source: WriteSource, value: number): WriteDecision {
  if (source === "client") {
    return { state: { ...state, forced: true, lastSource: "client" }, applied: true };
  }
  if (state.forced) {
    return { state: { ...state, plcValue: value }, applied: false };
  }
  return { state: { ...state, lastSource: "plc", plcValue: value }, applied: true };
}

export type ReleaseDecision = {
  state: TagState;
  // The PLC's last value, to apply as a PLC write: the bridge only sends
  // changes, so without it a released tag would keep the forced value until
  // the PLC changed its mind. Null when there is nothing to apply.
  reapplyValue: number | null;
};

export function decideRelease(state: TagState): ReleaseDecision {
  if (!state.forced) {
    return { state, reapplyValue: null };
  }
  return { state: { ...state, forced: false }, reapplyValue: state.plcValue };
}

/** A deleted or changed element forgets its tags' states, as it forgets its other runtime state. */
export function forgetTagStates(states: TagStates, ownerPrefix: string): void {
  for (const key of [...states.keys()]) {
    if (key.startsWith(ownerPrefix)) {
      states.delete(key);
    }
  }
}

/** The states of the tags that still exist: a deleted element's state must not outlive it. */
export function pruneTagStates(states: TagStates, existingKeys: ReadonlySet<string>): void {
  for (const key of [...states.keys()]) {
    if (!existingKeys.has(key)) {
      states.delete(key);
    }
  }
}
