import type { RedundantJointsDeletionResponse, RedundantJointsList } from "@pantin/protocol";
import { NO_CLOSE_PROMPT } from "./close-prompt.ts";
import { createTranslator, type Language, pluralKey } from "./i18n/translate.ts";
import { infoMessage, type PanelMessage } from "./messages.ts";
import { type ViewerState, withOpenPantin } from "./viewer-state.ts";

// State changes of "Supprimer les liaisons fixes redondantes…" (ADR 0060
// point 5), as pure functions.

/**
 * The core's preview arrived. Nothing redundant: say so, no prompt. Otherwise
 * ask, and drop the other pending questions so that one prompt shows.
 */
export function withRedundantJointsPreview(
  state: ViewerState,
  list: RedundantJointsList,
): ViewerState {
  if (list.redundant.length === 0) {
    return {
      ...state,
      pendingRedundantJoints: null,
      message: infoMessage("message.noRedundantJoints"),
    };
  }
  // The close prompt came first and stays: one prompt at a time.
  if (state.closePrompt) {
    return state;
  }
  return {
    ...state,
    pendingRedundantJoints: list,
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    pendingDeleteDevice: null,
    pendingDeleteAssembly: null,
    pendingGroup: null,
    pendingOrphanCleanup: null,
    pendingFeedReplacement: null,
    contextMenu: null,
    ...NO_CLOSE_PROMPT,
  };
}

export function withRedundantJointsCancelled(state: ViewerState): ViewerState {
  return { ...state, pendingRedundantJoints: null };
}

/** The ids the confirmation sends: exactly the previewed ones, never a fresh list. */
export function previewedJointIds(list: RedundantJointsList): string[] {
  return list.redundant.map(({ id }) => id);
}

/** The outcome line; its "skipped" sentence is translated here and kept as text. */
function redundantJointsMessage(
  response: RedundantJointsDeletionResponse,
  language: Language,
): PanelMessage {
  const t = createTranslator(language);
  const skipped =
    response.skipped.length === 0
      ? ""
      : t(pluralKey("message.redundantJoints.skipped", response.skipped.length, language), {
          skipped: response.skipped.length,
        });
  const count = response.deletedJoints.length;
  if (count === 0) {
    return infoMessage("message.redundantJoints.noneDeleted", { skipped });
  }
  const names = response.deletedJoints.map(({ name }) => name).join(", ");
  return infoMessage(pluralKey("message.redundantJoints.deleted", count, language), {
    count,
    names,
    skipped,
  });
}

// A joint form open on a joint that is gone would only be refused: close it.
function withFormClosedIfDeleted(
  state: ViewerState,
  response: RedundantJointsDeletionResponse,
): ViewerState {
  const editedId = state.jointForm?.jointId;
  const editedIsGone = response.deletedJoints.some(({ id }) => id === editedId);
  return editedIsGone ? { ...state, jointForm: null } : state;
}

/** The core answered with the whole Pantin: show it and the outcome. */
export function withRedundantJointsDeleted(
  state: ViewerState,
  response: RedundantJointsDeletionResponse,
): ViewerState {
  const shown = withOpenPantin({ ...state, pendingRedundantJoints: null }, response.pantin);
  return {
    ...withFormClosedIfDeleted(shown, response),
    message: redundantJointsMessage(response, state.language),
  };
}
