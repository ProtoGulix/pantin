import {
  endpointAssemblyIn,
  groupEndpoint,
  isBodyEndpoint,
  type Joint,
  type JointEndpoint,
  jointTreeIssues,
  type PantinDocument,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { findAnchorConflict } from "./anchor-conflicts.ts";
import { findAssembly } from "./assembly-contents.ts";
import { refuseBodyUsedAsFrame } from "./conveyor-rules.ts";
import { movingJointOf } from "./group-shared.ts";
import { refuseJointInUse } from "./joint-rules.ts";
import { reframeMovedBody } from "./move-body-frames.ts";

// Moving a body to another assembly (ADR 0019 point 9, ADR 0033 point 7, ADR
// 0055 point 11), as a pure function.
//
// The body keeps its displayed pose at every joint position, or the move is
// refused. A body with no parent joint follows its group, so it keeps its pose
// only if the old and the new group are displaced identically; a frame
// offset cannot make up for a group that moves differently. The safest rule is
// to refuse when they differ, naming the joint that tells them apart.

export type MoveBodyOutcome = { document: PantinDocument; deletedJoints: Joint[] };

function endpointAssemblyKey(document: PantinDocument, endpoint: JointEndpoint): string {
  return endpointAssemblyIn(endpoint, document.bodies) ?? "";
}

// The joints between the body and its old assembly: the other end is a body of
// it or the group itself.
function jointsToOldAssembly(
  document: PantinDocument,
  bodyId: string,
  oldAssembly: string,
): Joint[] {
  return document.joints.filter((joint) => {
    const other = isBodyEndpoint(joint.parent, bodyId) ? joint.child : joint.parent;
    const touches = isBodyEndpoint(joint.parent, bodyId) || isBodyEndpoint(joint.child, bodyId);
    return touches && endpointAssemblyKey(document, other) === oldAssembly;
  });
}

function refuseMovingJoint(document: PantinDocument, joint: Joint, bodyId: string): never {
  const bodyIsParent = isBodyEndpoint(joint.parent, bodyId);
  const other = endpointAssemblyKey(document, bodyIsParent ? joint.child : joint.parent);
  const target = bodyIsParent
    ? `body "${bodyId}" to its assembly "${other}"`
    : `body "${bodyId}" to the assembly "${other}"`;
  throw new ApiError(
    "conflict",
    `Joint "${joint.id}" (${joint.type}) links ${target} and moves. Delete it or make it a group joint first, then move the body.`,
  );
}

// The body, the old group and the new group must be displaced identically at
// every joint position (same moving joint, or none): then deleting the fixed
// joints to the old assembly and following the new group change no pose.
function refuseBodyMovedByOtherJoint(
  document: PantinDocument,
  bodyId: string,
  oldAssembly: string,
  newAssembly: string,
): void {
  const oldMover = movingJointOf(document, groupEndpoint(oldAssembly));
  const newMover = movingJointOf(document, groupEndpoint(newAssembly));
  const bodyMover = movingJointOf(document, { kind: "body", id: bodyId });
  if (bodyMover !== undefined && bodyMover.id !== oldMover?.id) {
    throw new ApiError(
      "conflict",
      `Body "${bodyId}" is moved by joint "${bodyMover.id}", not with its assembly "${oldAssembly}". Delete that joint first, or move the whole group.`,
    );
  }
  if (newMover?.id !== oldMover?.id) {
    const reason = (mover: Joint | undefined, key: string) =>
      mover === undefined ? `assembly "${key}" never moves` : `joint "${mover.id}" moves "${key}"`;
    throw new ApiError(
      "conflict",
      `Body "${bodyId}" would jump when the groups move: ${reason(oldMover, oldAssembly)}, ${reason(newMover, newAssembly)}. Move it to an assembly that moves with "${oldAssembly}".`,
    );
  }
}

export function moveBody(
  document: PantinDocument,
  bodyId: string,
  assembly: string,
): MoveBodyOutcome {
  findAssembly(document, assembly);
  const movedBody = document.bodies.find((body) => body.id === bodyId);
  if (movedBody === undefined) {
    throw new ApiError("not_found", `This Pantin has no body "${bodyId}".`);
  }
  const oldAssembly = movedBody.assembly;
  if (oldAssembly === assembly) {
    return { document, deletedJoints: [] };
  }
  // Objects follow a body of their own assembly only (ADR 0043 point 2).
  refuseBodyUsedAsFrame(document, bodyId, `move to assembly "${assembly}"`);
  const links = jointsToOldAssembly(document, bodyId, oldAssembly);
  for (const link of links.filter((joint) => joint.type !== "fixed")) {
    refuseMovingJoint(document, link, bodyId);
  }
  for (const link of links) {
    refuseJointInUse(document, link.id);
  }
  return moveWithoutLinks(document, bodyId, oldAssembly, assembly, links);
}

function moveWithoutLinks(
  document: PantinDocument,
  bodyId: string,
  oldAssembly: string,
  assembly: string,
  deleted: readonly Joint[],
): MoveBodyOutcome {
  const deletedIds = new Set(deleted.map(({ id }) => id));
  const kept: PantinDocument = {
    ...document,
    joints: document.joints.filter((joint) => !deletedIds.has(joint.id)),
  };
  const bodies = kept.bodies.map((body) => (body.id === bodyId ? { ...body, assembly } : body));
  const moved = { ...kept, bodies };
  const [treeIssue] = jointTreeIssues(moved);
  if (treeIssue !== undefined) {
    throw new ApiError("conflict", treeIssue.message);
  }
  const touching = kept.joints.filter(
    (joint) => isBodyEndpoint(joint.parent, bodyId) || isBodyEndpoint(joint.child, bodyId),
  );
  const conflict = findAnchorConflict(moved, new Set(touching.map(({ id }) => id)));
  if (conflict !== undefined) {
    throw new ApiError("conflict", conflict);
  }
  // After the structure checks, whose messages (a loop) say more than a jump.
  refuseBodyMovedByOtherJoint(document, bodyId, oldAssembly, assembly);
  return { document: reframeMovedBody(kept, moved, bodyId), deletedJoints: [...deleted] };
}
