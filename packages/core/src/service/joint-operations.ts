import type {
  CreateJointRequest,
  Joint,
  PantinId,
  PantinResponse,
  PoseResponse,
  PoseSnapshot,
} from "@pantin/protocol";
import { addJointToDocument, updateJointInDocument } from "../domain/joint-rules.ts";
import { clampJointPosition, haveSameCoordinateUnit } from "../domain/joint-types/registry.ts";
import { computePoses, currentJointPosition } from "../domain/kinematics.ts";
import { removeJoint } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import { waitForImports } from "./mesh-lifecycle.ts";
import { loadPantin, type OpenPantin, type ServiceContext, toResponse } from "./open-pantins.ts";

// Joints of an open Pantin (ADR 0011): document edits, runtime positions, pose.

function findJoint(pantinId: PantinId, openPantin: OpenPantin, jointId: string): Joint {
  const joint = openPantin.document.joints.find((candidate) => candidate.id === jointId);
  if (joint === undefined) {
    throw new ApiError("not_found", `Pantin "${pantinId}" has no joint "${jointId}".`);
  }
  return joint;
}

function toPoseResponse(openPantin: OpenPantin): PoseResponse {
  const { document, jointPositions } = openPantin;
  return {
    jointPositions: document.joints.map((joint) => ({
      jointId: joint.id,
      position: currentJointPosition(joint, jointPositions),
    })),
    bodies: computePoses(document, jointPositions),
  };
}

export function toPoseSnapshot(openPantin: OpenPantin): PoseSnapshot {
  return { stepCount: openPantin.stepCount, ...toPoseResponse(openPantin) };
}

export async function getPoseSnapshot(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<PoseSnapshot> {
  return toPoseSnapshot(await loadPantin(context, pantinId));
}

export async function listJoints(context: ServiceContext, pantinId: PantinId): Promise<Joint[]> {
  return (await loadPantin(context, pantinId)).document.joints;
}

export async function createJoint(
  context: ServiceContext,
  pantinId: PantinId,
  request: CreateJointRequest,
): Promise<Joint> {
  const openPantin = await loadPantin(context, pantinId);
  // A body reserved by an import in flight may still be rolled back: link
  // only bodies whose import has settled.
  await waitForImports(openPantin);
  const { document, joint } = addJointToDocument(openPantin.document, request);
  openPantin.document = document;
  return joint;
}

export async function updateJoint(
  context: ServiceContext,
  pantinId: PantinId,
  jointId: string,
  request: CreateJointRequest,
): Promise<Joint> {
  const openPantin = await loadPantin(context, pantinId);
  await waitForImports(openPantin);
  const before = findJoint(pantinId, openPantin, jointId);
  const { document, joint } = updateJointInDocument(openPantin.document, jointId, request);
  openPantin.document = document;
  // A position or setpoint in another unit means nothing any more (ADR 0020),
  // and a joint that became fixed has neither (ADR 0018).
  if (!haveSameCoordinateUnit(before, joint)) {
    forgetJointRuntimeState(openPantin, jointId);
    return joint;
  }
  // New limits may exclude the current position: bring it back inside.
  const position = openPantin.jointPositions.get(jointId);
  if (position !== undefined) {
    openPantin.jointPositions.set(jointId, clampJointPosition(joint, position));
  }
  return joint;
}

export async function deleteJoint(
  context: ServiceContext,
  pantinId: PantinId,
  jointId: string,
): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  // An import in flight may still roll back its joints by id: deleting one
  // now would free that id for another import, whose joint the rollback
  // would then remove (ADR 0017 point 4).
  await waitForImports(openPantin);
  findJoint(pantinId, openPantin, jointId);
  openPantin.document = removeJoint(openPantin.document, jointId);
  forgetJointRuntimeState(openPantin, jointId);
  return toResponse(pantinId, openPantin);
}

// A joint created later under the same id must start from position 0.
export function forgetJointRuntimeState(openPantin: OpenPantin, jointId: string): void {
  openPantin.jointPositions.delete(jointId);
  openPantin.setpoints.delete(jointId);
  openPantin.queuedSetpoints.delete(jointId);
}

export async function getPose(context: ServiceContext, pantinId: PantinId): Promise<PoseResponse> {
  return toPoseResponse(await loadPantin(context, pantinId));
}

export async function setJointPosition(
  context: ServiceContext,
  pantinId: PantinId,
  jointId: string,
  position: number,
): Promise<PoseResponse> {
  const openPantin = await loadPantin(context, pantinId);
  const joint = findJoint(pantinId, openPantin, jointId);
  openPantin.jointPositions.set(jointId, clampJointPosition(joint, position));
  return toPoseResponse(openPantin);
}
