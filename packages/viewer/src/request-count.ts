import type { ViewerState } from "./viewer-state.ts";

// The number of requests in flight, which disables the menus while an edit runs.

export function withRequestStarted(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: state.pendingRequestCount + 1 };
}

export function withRequestFinished(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: Math.max(0, state.pendingRequestCount - 1) };
}
