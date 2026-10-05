// The axes of the placement gizmo are a viewer preference kept in the browser
// (ADR 0042 point 2): the assembly's own ("local", the default) or its anchor's.

/** Which axes the gizmo offers (ADR 0042 point 2): the assembly's own, or its anchor's. */
export type GizmoSpace = "local" | "global";

export const DEFAULT_GIZMO_SPACE: GizmoSpace = "local";

/** A stored value that is missing or unreadable gives the default. */
export function parseStoredGizmoSpace(stored: string | null): GizmoSpace {
  return stored === "global" || stored === "local" ? stored : DEFAULT_GIZMO_SPACE;
}
