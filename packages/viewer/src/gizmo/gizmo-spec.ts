import { showsViewport } from "../central-layout.ts";
import { nodeSelection, selectedNodeIdOf } from "../selection.ts";
import { assemblyNodeId, parseNodeId } from "../tree/node-ids.ts";
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

/**
 * The assembly the positioning tools act on: the selected assembly, at any
 * depth, or the assembly of the selected body (ADR 0039 point 6). Null for any
 * other selection.
 */
export function toolAssemblyKeyOf(state: ViewerState): string | null {
  const { openPantin } = state;
  const selected = selectedNodeIdOf(state.selection);
  const ref = selected === null ? null : parseNodeId(selected);
  if (openPantin === null || ref === null || ref.pantinId !== openPantin.id) {
    return null;
  }
  if (ref.kind === "assembly") {
    return ref.key;
  }
  if (ref.kind !== "body") {
    return null;
  }
  return openPantin.document.bodies.find((body) => body.id === ref.bodyId)?.assembly ?? null;
}

/** True when a tool can be switched on: an assembly or a body is selected, and the 3D view shown. */
export function canUseGizmo(state: ViewerState): boolean {
  const key = toolAssemblyKeyOf(state);
  if (key === null || state.openPantin === null) {
    return false;
  }
  const selection = nodeSelection(assemblyNodeId(state.openPantin.id, key));
  return gizmoSpecOf({ ...state, gizmoMode: "move", selection }) !== null;
}
