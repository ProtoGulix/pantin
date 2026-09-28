import type { PantinResponse, PantinSummary } from "@pantin/protocol";
import type { PendingImport } from "./import-options.ts";

// Everything the viewer shows, as plain data. The core stays the source of
// truth: this is only the last answer it gave, plus purely local UI state.
export interface ViewerState {
  pantins: readonly PantinSummary[];
  openPantin: PantinResponse | null;
  selectedBodyId: string | null;
  pendingImport: PendingImport | null;
  // Number of requests in flight; buttons are disabled while it is not zero.
  pendingRequestCount: number;
  errorMessage: string | null;
}

export const INITIAL_VIEWER_STATE: ViewerState = {
  pantins: [],
  openPantin: null,
  selectedBodyId: null,
  pendingImport: null,
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
