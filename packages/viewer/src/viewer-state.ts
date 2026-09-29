import type { Body, PantinResponse, PantinSummary } from "@pantin/protocol";
import type { Language } from "./i18n/translate.ts";
import type { PendingImport } from "./import-options.ts";
import type { PanelMessage } from "./messages.ts";
import { bodyNodeId, folderNodeId, pantinNodeId } from "./tree/node-ids.ts";
import { nodeExists, withExpanded, withRevealedNode } from "./tree/tree-state.ts";

// Everything the viewer shows, as plain data. The core stays the source of
// truth: this is only the last answer it gave, plus purely local UI state.

interface ContextMenuState {
  nodeId: string;
  // Viewport coordinates of the pointer, in CSS pixels.
  x: number;
  y: number;
}

export interface ViewerState {
  language: Language;
  pantins: readonly PantinSummary[];
  openPantin: PantinResponse | null;
  expandedNodeIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  renamingNodeId: string | null;
  collapsedPropertyGroups: ReadonlySet<string>;
  creatingPantin: boolean;
  contextMenu: ContextMenuState | null;
  pendingImport: PendingImport | null;
  // True from the click on Import until the core answers; a STEP conversion
  // can take up to two minutes (ADR 0009), and a second submission is refused.
  importInProgress: boolean;
  // Number of requests in flight; actions are disabled while it is not zero.
  pendingRequestCount: number;
  message: PanelMessage | null;
}

export function initialViewerState(language: Language): ViewerState {
  return {
    language,
    pantins: [],
    openPantin: null,
    expandedNodeIds: new Set(),
    selectedNodeId: null,
    renamingNodeId: null,
    collapsedPropertyGroups: new Set(),
    creatingPantin: false,
    contextMenu: null,
    pendingImport: null,
    importInProgress: false,
    pendingRequestCount: 0,
    message: null,
  };
}

/**
 * Shows the core's latest answer for the open Pantin. Opening another Pantin
 * expands it and its Bodies folder; a selection that no longer exists moves to
 * the Pantin itself.
 */
export function withOpenPantin(state: ViewerState, openPantin: PantinResponse): ViewerState {
  const samePantin = state.openPantin?.id === openPantin.id;
  let next: ViewerState = {
    ...state,
    openPantin,
    pendingImport: samePantin ? state.pendingImport : null,
    importInProgress: samePantin ? state.importInProgress : false,
  };
  if (!samePantin) {
    next = withExpanded(next, pantinNodeId(openPantin.id), true);
    next = withExpanded(next, folderNodeId(openPantin.id, "bodies"), true);
  }
  const selectionExists = next.selectedNodeId !== null && nodeExists(next, next.selectedNodeId);
  return selectionExists ? next : { ...next, selectedNodeId: pantinNodeId(openPantin.id) };
}

export function withRequestStarted(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: state.pendingRequestCount + 1 };
}

export function withRequestFinished(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: Math.max(0, state.pendingRequestCount - 1) };
}

export function withImportStarted(state: ViewerState): ViewerState {
  return { ...state, importInProgress: true, message: null };
}

/** The import failed: the form stays open so the user can retry or cancel. */
export function withImportFailed(state: ViewerState): ViewerState {
  return { ...state, importInProgress: false };
}

/**
 * The core created one body (GLB, STL) or several (one per STEP assembly
 * component). The form closes and the first new body is selected and shown
 * in the tree, so the user sees at once what arrived.
 */
export function withImportedBodies(
  state: ViewerState,
  importedBodies: readonly Body[],
): ViewerState {
  const closed: ViewerState = { ...state, importInProgress: false, pendingImport: null };
  const firstBody = importedBodies[0];
  const pantinId = state.openPantin?.id;
  return firstBody === undefined || pantinId === undefined
    ? closed
    : withRevealedNode(closed, bodyNodeId(pantinId, firstBody.id));
}
