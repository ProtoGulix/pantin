import type { FaceHighlight } from "../alignment/alignment-session.ts";

// Kept apart from axis-pick.ts, whose transitions read the whole ViewerState:
// the viewer state holds this type, so sharing one module would be a cycle.

/** The mode under way, display state only. It never outlives its joint form. */
export interface AxisPickState {
  pantinId: string;
  jointId: string;
  // The selected node when it started: another selection ends it.
  nodeId: string | null;
  // True until a face is picked; afterwards the picked face stays tinted.
  waiting: boolean;
  highlight: FaceHighlight | null;
}
