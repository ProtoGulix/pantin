import { withTypedStep } from "../gizmo/gizmo-steps.ts";
import type { DragKind, SnapSteps } from "../gizmo/placement-snapping.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The placement gizmo's switches and steps (ADR 0034 points 3 and 5): display
// state of the viewer. The steps are kept in the browser, never in the Pantin.

/** The same command again turns the gizmo off. */
export function toggleGizmo(store: ViewerStore, kind: DragKind): void {
  const { gizmoMode } = store.state;
  const next = gizmoMode === kind ? null : kind;
  // One tool at a time: the gizmo ends an alignment (ADR 0035).
  const alignment = next === null ? store.state.alignment : null;
  store.update({ ...store.state, gizmoMode: next, alignment });
}

/** A typed step; text that is not a positive number leaves the step as it was. */
export function setGizmoStep(store: ViewerStore, field: keyof SnapSteps, text: string): void {
  const steps = withTypedStep(store.state.gizmoSteps, field, text);
  if (steps !== store.state.gizmoSteps) {
    store.ports.storeGizmoSteps(steps);
  }
  store.update({ ...store.state, gizmoSteps: steps });
}
