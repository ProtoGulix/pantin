import type { AssemblyDeletion } from "@pantin/protocol";
import type { Endpoint, ReplacedFeed } from "./diagram/diagram-wiring.ts";

// Small value types of ViewerState, apart so that the state file stays short.

export interface ContextMenuState {
  nodeId: string;
  // Viewport coordinates of the pointer, in CSS pixels.
  x: number;
  y: number;
}

// A link drawn in the diagram that replaces a whole feed, waiting for the
// user to confirm (ADR 0029 point 6). The endpoints are kept, not the edit:
// the edit is rebuilt from the document as it is when the user answers.
export interface PendingDiagramLink {
  from: Endpoint;
  to: Endpoint;
  replaced: ReplacedFeed;
}

export interface PendingAssemblyDeletion {
  key: string;
  contents: AssemblyDeletion;
}

export interface InspectorFocusRequest {
  key: string;
  serial: number;
}
