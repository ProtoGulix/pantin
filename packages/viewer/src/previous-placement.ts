import type { PantinResponse, Placement } from "@pantin/protocol";
import { anchorOfAssembly } from "./assembly-anchor.ts";

// "Rétablir le placement précédent" (ADR 0039 point 11): per assembly, the
// placement it had before the last placement edit of this session (typed,
// dragged or aligned) and the anchor it had then. One value per assembly, not
// a history; restoring consumes it. Display state, never saved; it goes with
// the Pantin (closed, another opened, discarded) and with the assembly.

export interface PreviousPlacement {
  placement: Placement;
  // The anchor assembly at the time of the edit; null: the world.
  anchor: string | null;
}

export type PreviousPlacements = ReadonlyMap<string, PreviousPlacement>;

export const NO_PREVIOUS_PLACEMENTS: PreviousPlacements = new Map();

// The slice of the viewer state these helpers read, spelled out rather than
// picked from ViewerState, which itself holds a PreviousPlacements.
type PlacementState = {
  readonly openPantin: PantinResponse | null;
  readonly previousPlacements: PreviousPlacements;
};

/** What the restore button offers for one assembly of the open Pantin. */
export type Restorable =
  | { kind: "ready"; placement: Placement }
  | { kind: "nothing" }
  | { kind: "anchorChanged" };

/** The placement and anchor of an assembly of the open Pantin, to keep before an edit. */
export function placementBeforeEdit(state: PlacementState, key: string): PreviousPlacement | null {
  const document = state.openPantin?.document;
  const assembly = document?.assemblies.find((candidate) => candidate.key === key);
  return document === undefined || assembly === undefined
    ? null
    : { placement: assembly.placement, anchor: anchorOfAssembly(document, key) };
}

/** The edit that just succeeded replaces what was kept for that assembly. */
export function withPreviousPlacementKept<State extends PlacementState>(
  state: State,
  key: string,
  previous: PreviousPlacement,
): State {
  return { ...state, previousPlacements: new Map(state.previousPlacements).set(key, previous) };
}

/** Consumed by a restore, or gone with its assembly. */
export function withPreviousPlacementDropped<State extends PlacementState>(
  state: State,
  keys: string | readonly string[],
): State {
  const gone = new Set(typeof keys === "string" ? [keys] : keys);
  const kept = [...state.previousPlacements].filter(([key]) => !gone.has(key));
  return { ...state, previousPlacements: new Map(kept) };
}

/** A renamed assembly key (ADR 0019) keeps its value, and the anchors that named it. */
export function withPreviousPlacementKeyRenamed<State extends PlacementState>(
  state: State,
  from: string,
  to: string,
): State {
  const rename = (key: string) => (key === from ? to : key);
  const renamed = [...state.previousPlacements].map(
    ([key, { placement, anchor }]) =>
      [rename(key), { placement, anchor: anchor === null ? null : rename(anchor) }] as const,
  );
  return { ...state, previousPlacements: new Map(renamed) };
}

/** Offered only while the anchor is the one the assembly had at that edit. */
export function restorableOf(state: PlacementState, key: string): Restorable {
  const previous = state.previousPlacements.get(key);
  const document = state.openPantin?.document;
  if (previous === undefined || document === undefined) {
    return { kind: "nothing" };
  }
  return anchorOfAssembly(document, key) === previous.anchor
    ? { kind: "ready", placement: previous.placement }
    : { kind: "anchorChanged" };
}
