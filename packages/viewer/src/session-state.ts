import type { PantinResponse } from "@pantin/protocol";
import { infoMessage } from "./messages.ts";
import { nodeSelection } from "./selection.ts";
import { pantinNodeId, parseNodeId } from "./tree/node-ids.ts";
import { withSelection } from "./tree/tree-state.ts";
import { type ViewerState, type WelcomeTab, withOpenPantin } from "./viewer-state.ts";

// The two views and their transitions, as pure functions. List view: no
// Pantin open (openPantin null; the welcome dialog, ADR 0027). Edit view:
// exactly one open Pantin.

export type ViewMode = "list" | "edit";

export function viewModeOf(state: ViewerState): ViewMode {
  return state.openPantin === null ? "list" : "edit";
}

/** Back to the welcome dialog: nothing of the closed Pantin stays on screen. */
export function withPantinClosed(state: ViewerState): ViewerState {
  return {
    ...withSelection(state, null),
    listSelectedPantinId: state.openPantin?.id ?? state.listSelectedPantinId,
    openPantin: null,
    welcomeHidden: false,
    expandedNodeIds: new Set(),
    contextMenu: null,
    pendingImport: null,
    importInProgress: false,
    closePrompt: false,
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    pendingFeedReplacement: null,
    jointForm: null,
  };
}

/** Close directly when everything is saved; otherwise ask first. */
export function withCloseRequested(state: ViewerState): ViewerState {
  if (state.openPantin === null) {
    return state;
  }
  return state.openPantin.unsavedChanges
    ? {
        ...state,
        closePrompt: true,
        contextMenu: null,
        pendingDeleteBodyId: null,
        pendingDeleteJointId: null,
        pendingFeedReplacement: null,
      }
    : withPantinClosed(state);
}

/**
 * The core threw the unsaved edits away (POST .../discard) and sent back the
 * saved Pantin: nothing is left to ask, so the edit view closes.
 */
export function withEditsDiscarded(state: ViewerState, saved: PantinResponse): ViewerState {
  return withPantinClosed(withOpenPantin(state, saved));
}

export function withCloseCancelled(state: ViewerState): ViewerState {
  return { ...state, closePrompt: false };
}

/** Escape or the close button: the empty workspace, without a half-typed name. */
export function withWelcomeHidden(state: ViewerState): ViewerState {
  return { ...state, welcomeHidden: true, creatingPantin: false };
}

/** File > Welcome (or Open… with nothing open): the dialog, on the given tab if any. */
export function withWelcomeShown(state: ViewerState, tab?: WelcomeTab): ViewerState {
  return { ...state, welcomeHidden: false, welcomeTab: tab ?? state.welcomeTab };
}

export function withWelcomeTab(state: ViewerState, welcomeTab: WelcomeTab): ViewerState {
  return { ...state, welcomeTab };
}

export function withWelcomeFilter(state: ViewerState, welcomeFilter: string): ViewerState {
  return { ...state, welcomeFilter };
}

export function withListSelection(state: ViewerState, pantinId: string | null): ViewerState {
  const exists = state.pantins.some((summary) => summary.id === pantinId);
  return { ...state, listSelectedPantinId: exists ? pantinId : null };
}

/**
 * Asks to confirm the deletion of the body or the joint a node stands for
 * (never a source node, a folder or the Pantin).
 */
export function withDeleteRequested(state: ViewerState, nodeId: string): ViewerState {
  const ref = parseNodeId(nodeId);
  const bodyId = ref?.kind === "body" ? ref.bodyId : null;
  const jointId = ref?.kind === "joint" ? ref.jointId : null;
  const bodyExists = state.openPantin?.document.bodies.some((body) => body.id === bodyId) ?? false;
  const jointExists =
    state.openPantin?.document.joints.some((joint) => joint.id === jointId) ?? false;
  if (!bodyExists && !jointExists) {
    return state;
  }
  return {
    // Through withSelection: a node clicked in the diagram must not stay selected there.
    ...withSelection(state, nodeSelection(nodeId)),
    pendingDeleteBodyId: bodyExists ? bodyId : null,
    pendingDeleteJointId: jointExists ? jointId : null,
    pendingFeedReplacement: null,
    contextMenu: null,
    closePrompt: false,
  };
}

export function withDeleteCancelled(state: ViewerState): ViewerState {
  return { ...state, pendingDeleteBodyId: null, pendingDeleteJointId: null };
}

/** The core answered the DELETE with the whole Pantin: show it, select the Pantin. */
export function withBodyDeleted(
  state: ViewerState,
  response: PantinResponse,
  bodyName: string,
): ViewerState {
  const shown = withOpenPantin({ ...state, pendingDeleteBodyId: null }, response);
  return {
    ...withSelection(shown, nodeSelection(pantinNodeId(response.id))),
    message: infoMessage("message.deleted", { name: bodyName }),
  };
}

/** The core answered the joint's DELETE with the whole Pantin: show it, select the Pantin. */
export function withJointDeleted(
  state: ViewerState,
  response: PantinResponse,
  jointName: string,
): ViewerState {
  const shown = withOpenPantin({ ...state, pendingDeleteJointId: null }, response);
  return {
    ...withSelection(shown, nodeSelection(pantinNodeId(response.id))),
    message: infoMessage("message.jointDeleted", { name: jointName }),
  };
}
