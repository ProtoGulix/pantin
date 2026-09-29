import type {
  CreateJointRequest,
  Joint,
  PantinId,
  PantinResponse,
  PoseResponse,
} from "@pantin/protocol";
import { addJointToDocument } from "../domain/joint-rules.ts";
import { clampJointPosition, computePoses, currentJointPosition } from "../domain/kinematics.ts";
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

export async function deleteJoint(
  context: ServiceContext,
  pantinId: PantinId,
  jointId: string,
): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  findJoint(pantinId, openPantin, jointId);
  openPantin.document = removeJoint(openPantin.document, jointId);
  openPantin.jointPositions.delete(jointId);
  openPantin.setpoints.delete(jointId);
  openPantin.queuedSetpoints.delete(jointId);
  return toResponse(pantinId, openPantin);
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
