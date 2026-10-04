import { withTypedStep } from "../gizmo/gizmo-steps.ts";
import type { DragKind, SnapSteps } from "../gizmo/placement-snapping.ts";
import { isBodySelected, withToolTarget } from "../gizmo/tool-rules.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The placement gizmo's switches and steps (ADR 0034 points 3 and 5): display
// state of the viewer. The steps are kept in the browser, never in the Pantin.

/**
 * The same command again turns the gizmo off. From a body, the selection moves
 * to the body's assembly and the gizmo goes on there (the body shows none).
 */
export function toggleGizmo(store: ViewerStore, kind: DragKind): void {
  const { state } = store;
  const fromBody = isBodySelected(state);
  const next = state.gizmoMode === kind && !fromBody ? null : kind;
  if (next === null) {
    store.update({ ...state, gizmoMode: null });
    return;
  }
  // One tool at a time: the gizmo ends an alignment (ADR 0035).
  store.update({ ...withToolTarget(state), gizmoMode: next, alignment: null });
}

/** Escape with nothing else to close: no positioning tool stays on (ADR 0039 point 6). */
export function turnToolOff(store: ViewerStore): void {
  store.update({ ...store.state, gizmoMode: null, alignment: null });
}

/** A typed step; text that is not a positive number leaves the step as it was. */
export function setGizmoStep(store: ViewerStore, field: keyof SnapSteps, text: string): void {
  const steps = withTypedStep(store.state.gizmoSteps, field, text);
  if (steps !== store.state.gizmoSteps) {
    store.ports.storeGizmoSteps(steps);
  }
  store.update({ ...store.state, gizmoSteps: steps });
}
