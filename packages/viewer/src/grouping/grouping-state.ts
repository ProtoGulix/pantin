import { NO_CLOSE_PROMPT, type ViewerState } from "../viewer-state.ts";
import type { GroupingTarget } from "./grouping-model.ts";

// The "Grouper…" question as plain state: the members the user chose and the
// name typed so far. Pure transitions, like session-state.ts.

/** Opens the name question; the close question, when open, comes first and stays. */
export function withGroupRequested(
  state: ViewerState,
  target: GroupingTarget,
  suggestedName: string,
): ViewerState {
  if (state.closePrompt) {
    return state;
  }
  return {
    ...state,
    pendingGroup: { target, name: suggestedName },
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    pendingDeleteAssembly: null,
    pendingOrphanCleanup: null,
    pendingRedundantJoints: null,
    pendingFeedReplacement: null,
    contextMenu: null,
    ...NO_CLOSE_PROMPT,
  };
}

export function withGroupNameEdited(state: ViewerState, name: string): ViewerState {
  return state.pendingGroup === null
    ? state
    : { ...state, pendingGroup: { ...state.pendingGroup, name } };
}

export function withGroupCancelled(state: ViewerState): ViewerState {
  return { ...state, pendingGroup: null };
}
