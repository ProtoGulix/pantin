import type {
  PantinId,
  RedundantJointsDeletionResponse,
  RedundantJointsList,
} from "@pantin/protocol";
import {
  deleteRedundantFixedJoints,
  findRedundantFixedJoints,
} from "../domain/redundant-joints.ts";
import { applyOutcomeEdit } from "./assembly-operations.ts";
import { forgetJointRuntimeState } from "./joint-operations.ts";
import { loadSettledPantin } from "./mesh-lifecycle.ts";
import type { ServiceContext } from "./open-pantins.ts";

// Deleting the fixed joints that groups made redundant (ADR 0060): a preview
// that changes nothing, then one document edit with the exact ids confirmed.

async function listRedundantJoints(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<RedundantJointsList> {
  const openPantin = await loadSettledPantin(context, pantinId);
  return findRedundantFixedJoints(openPantin.document);
}

async function deleteRedundantJoints(
  context: ServiceContext,
  pantinId: PantinId,
  jointIds: readonly string[],
): Promise<RedundantJointsDeletionResponse> {
  const { outcome, openPantin, response } = await applyOutcomeEdit(context, pantinId, (document) =>
    deleteRedundantFixedJoints(document, jointIds),
  );
  // A joint created later under a deleted id must start at 0.
  for (const { id } of outcome.deletedJoints) {
    forgetJointRuntimeState(openPantin, id);
  }
  return {
    pantin: response,
    deletedJoints: outcome.deletedJoints.map(({ id, name }) => ({ id, name })),
    skipped: outcome.skipped,
  };
}

export function redundantJointsOperations(context: ServiceContext) {
  return {
    listRedundantJoints: (pantinId: PantinId) => listRedundantJoints(context, pantinId),
    deleteRedundantJoints: (pantinId: PantinId, jointIds: readonly string[]) =>
      deleteRedundantJoints(context, pantinId, jointIds),
  };
}
