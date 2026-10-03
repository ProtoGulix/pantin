import {
  MAX_ORPHAN_DELETIONS_PER_REQUEST,
  type OrphanMeshDeletionResponse,
  type OrphanMeshList,
} from "@pantin/protocol";
import { infoMessage } from "./messages.ts";
import { orphanCleanupMessage } from "./panel/orphan-cleanup-details.ts";
import type { ViewerState } from "./viewer-state.ts";

// State changes of the orphan cleanup (ADR 0038 point 7), as pure functions.

/**
 * The core's preview arrived. Nothing to clean: say so, no prompt. Otherwise
 * ask, and drop the other pending deletions so that one prompt shows.
 */
export function withOrphanPreview(state: ViewerState, list: OrphanMeshList): ViewerState {
  if (list.files.length === 0) {
    return { ...state, pendingOrphanCleanup: null, message: infoMessage("message.noOrphanMeshes") };
  }
  // The close prompt came first and stays: one prompt at a time.
  if (state.closePrompt) {
    return state;
  }
  return {
    ...state,
    pendingOrphanCleanup: list,
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    pendingDeleteAssembly: null,
    pendingFeedReplacement: null,
    contextMenu: null,
  };
}

/** The merged answers of all the batches: forget the prompt, show the outcome. */
export function withOrphanCleanupDone(
  state: ViewerState,
  response: OrphanMeshDeletionResponse,
): ViewerState {
  return {
    ...state,
    pendingOrphanCleanup: null,
    message: orphanCleanupMessage(response, state.language),
  };
}

/** The names cut into requests the core accepts, in order. */
export function deletionBatches(fileNames: readonly string[]): string[][] {
  const batches: string[][] = [];
  for (let start = 0; start < fileNames.length; start += MAX_ORPHAN_DELETIONS_PER_REQUEST) {
    batches.push(fileNames.slice(start, start + MAX_ORPHAN_DELETIONS_PER_REQUEST));
  }
  return batches;
}

export function mergedResponses(
  responses: readonly OrphanMeshDeletionResponse[],
): OrphanMeshDeletionResponse {
  return {
    deleted: responses.flatMap((response) => response.deleted),
    skipped: responses.flatMap((response) => response.skipped),
    failed: responses.flatMap((response) => response.failed),
  };
}
