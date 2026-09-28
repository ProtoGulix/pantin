import type { Body, PantinResponse, PantinSummary } from "@pantin/protocol";
import type { PendingImport } from "./import-options.ts";

// Everything the viewer shows, as plain data. The core stays the source of
// truth: this is only the last answer it gave, plus purely local UI state.
export interface ViewerState {
  pantins: readonly PantinSummary[];
  openPantin: PantinResponse | null;
  selectedBodyId: string | null;
  pendingImport: PendingImport | null;
  // True from the click on Import until the core answers; a STEP conversion
  // can take up to two minutes (ADR 0009), and a second submission is refused.
  importInProgress: boolean;
  // Number of requests in flight; buttons are disabled while it is not zero.
  pendingRequestCount: number;
  errorMessage: string | null;
}

export const INITIAL_VIEWER_STATE: ViewerState = {
  pantins: [],
  openPantin: null,
  selectedBodyId: null,
  pendingImport: null,
  importInProgress: false,
  pendingRequestCount: 0,
  errorMessage: null,
};

export function withOpenPantin(state: ViewerState, openPantin: PantinResponse): ViewerState {
  const samePantin = state.openPantin?.id === openPantin.id;
  const selectionStillExists = openPantin.document.bodies.some(
    (body) => body.id === state.selectedBodyId,
  );
  return {
    ...state,
    openPantin,
    selectedBodyId: samePantin && selectionStillExists ? state.selectedBodyId : null,
    pendingImport: samePantin ? state.pendingImport : null,
    importInProgress: samePantin ? state.importInProgress : false,
  };
}

export function withSelectedBody(state: ViewerState, bodyId: string | null): ViewerState {
  const exists = state.openPantin?.document.bodies.some((body) => body.id === bodyId) ?? false;
  return { ...state, selectedBodyId: exists ? bodyId : null };
}

export function withRequestStarted(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: state.pendingRequestCount + 1, errorMessage: null };
}

export function withRequestFinished(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: Math.max(0, state.pendingRequestCount - 1) };
}

export function withImportStarted(state: ViewerState): ViewerState {
  return { ...state, importInProgress: true, errorMessage: null };
}

/** The import failed: the form stays open so the user can retry or cancel. */
export function withImportFailed(state: ViewerState): ViewerState {
  return { ...state, importInProgress: false };
}

/**
 * The core created one body (GLB, STL) or several (one per STEP assembly
 * component). The form closes and the first new body is selected, so the user
 * sees at once what arrived.
 */
export function withImportedBodies(
  state: ViewerState,
  importedBodies: readonly Body[],
): ViewerState {
  const closed: ViewerState = { ...state, importInProgress: false, pendingImport: null };
  const firstBody = importedBodies[0];
  return firstBody === undefined ? closed : withSelectedBody(closed, firstBody.id);
}
