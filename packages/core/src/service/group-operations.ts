import type {
  DeletedJoint,
  GroupBodiesRequest,
  GroupBodiesResponse,
  Joint,
  PantinId,
  UngroupResponse,
} from "@pantin/protocol";
import { groupBodies } from "../domain/group-bodies.ts";
import { renamedTags } from "../domain/tags.ts";
import { ungroup } from "../domain/ungroup.ts";
import { applyOutcomeEdit } from "./assembly-operations.ts";
import { forgetJointRuntimeState } from "./joint-operations.ts";
import type { OpenPantin, ServiceContext } from "./open-pantins.ts";

// Grouper and Dégrouper of an open Pantin (ADR 0055 points 6 to 8). One
// document edit each, so a refusal leaves the Pantin untouched. A deleted
// joint leaves the runtime too: a joint created later under its id starts at 0.

function listed(joints: readonly Joint[]): DeletedJoint[] {
  return joints.map(({ id, name }) => ({ id, name }));
}

function forgetDeletedJoints(openPantin: OpenPantin, joints: readonly Joint[]): void {
  for (const joint of joints) {
    forgetJointRuntimeState(openPantin, joint.id);
  }
}

export function groupOperations(context: ServiceContext) {
  return {
    groupBodies: async (
      pantinId: PantinId,
      assemblyKey: string,
      request: GroupBodiesRequest,
    ): Promise<GroupBodiesResponse> => {
      const { outcome, openPantin, before, after, response } = await applyOutcomeEdit(
        context,
        pantinId,
        (document) => groupBodies(document, assemblyKey, request),
      );
      forgetDeletedJoints(openPantin, outcome.deletedJoints);
      return {
        pantin: response,
        group: { key: outcome.group.key, name: outcome.group.name },
        deletedJoints: listed(outcome.deletedJoints),
        renamedTags: renamedTags(before, after),
      };
    },
    ungroup: async (pantinId: PantinId, assemblyKey: string): Promise<UngroupResponse> => {
      const { outcome, openPantin, before, after, response } = await applyOutcomeEdit(
        context,
        pantinId,
        (document) => ungroup(document, assemblyKey),
      );
      forgetDeletedJoints(openPantin, outcome.deletedJoints);
      return {
        pantin: response,
        deletedJoints: listed(outcome.deletedJoints),
        renamedTags: renamedTags(before, after),
      };
    },
  };
}
