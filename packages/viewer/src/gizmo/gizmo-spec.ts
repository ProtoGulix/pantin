import { showsViewport } from "../central-layout.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import type { ViewerState } from "../viewer-state.ts";
import { gizmoTargetOf, type PlacementGizmoSpec } from "./anchor-frame.ts";

// What the 3D view must show of the gizmo for a state (ADR 0034 point 3): the
// gizmo exists only for exactly one selected assembly, while the 3D view is
// shown. A body (double click) or anything else selected shows none.

/** The assembly the gizmo would act on, or null when it cannot be shown. */
export function gizmoSpecOf(state: ViewerState): PlacementGizmoSpec | null {
  const { openPantin, gizmoMode } = state;
  const selected = selectedNodeIdOf(state.selection);
  if (openPantin === null || gizmoMode === null || selected === null) {
    return null;
  }
  const ref = parseNodeId(selected);
  if (ref?.kind !== "assembly" || ref.pantinId !== openPantin.id) {
    return null;
  }
  if (!showsViewport(state.centralLayout)) {
    return null;
  }
  const target = gizmoTargetOf(openPantin.document, ref.key);
  return target === null ? null : { target, kind: gizmoMode, steps: state.gizmoSteps };
}

/** True when the gizmo can be switched on: one assembly is selected (menu and toolbar rule). */
export function canUseGizmo(state: ViewerState): boolean {
  return gizmoSpecOf({ ...state, gizmoMode: "move" }) !== null;
}
