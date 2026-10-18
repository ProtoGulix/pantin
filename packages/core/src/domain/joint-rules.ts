import {
  type CreateJointRequest,
  endpointAssembly,
  endpointAssemblyIn,
  JOINT_COORDINATE_UNITS,
  type Joint,
  type JointEndpoint,
  type JointTreeIssueKind,
  jointTreeIssues,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { findAnchorConflict } from "./anchor-conflicts.ts";
import { refuseDrumJointLoss } from "./conveyor-rules.ts";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { haveSameCoordinateUnit } from "./joint-types/registry.ts";
import { keepDisplayedPose } from "./keep-displayed-pose.ts";
import { addJoint, removeJoint, replaceJoint } from "./pantin-document.ts";
import { tagKeyOwners } from "./tag-keys.ts";
import { parseWithSchema } from "./validation.ts";

// Adding or changing a joint in a document (ADR 0011 point 3): the joints
// must stay a forest of known bodies. Pure: returns the new document and the
// stored joint. `positions` are the current joint positions: a joint that
// changes the anchor of an assembly keeps the displayed pose (ADR 0033
// point 6, keep-displayed-pose.ts).

// Refused before validation so that the answer is a conflict naming the joint
// in place (ADR 0033 point 2), not a schema error.
function refuseAnchorConflict(next: PantinDocument, jointId: string): void {
  const conflict = findAnchorConflict(next, new Set([jointId]));
  if (conflict !== undefined) {
    throw new ApiError("conflict", conflict);
  }
}

// ADR 0011 point 3 and ADR 0055 points 3 and 4, on the document the edit would
// produce. The two placement rules of ADR 0055 are conflicts with what the
// document holds, the others bad requests. The message names the joint.
const PLACEMENT_RULE_KINDS: ReadonlySet<JointTreeIssueKind> = new Set([
  "group_in_itself",
  "body_child_between_assemblies",
]);

function refuseLinkProblem(next: PantinDocument): void {
  const [issue] = jointTreeIssues(next);
  if (issue !== undefined) {
    throw new ApiError(
      PLACEMENT_RULE_KINDS.has(issue.kind) ? "conflict" : "invalid_request",
      issue.message,
    );
  }
}

function validatedJoint(document: PantinDocument, id: string, context: string) {
  const updated = parseWithSchema(PantinDocumentSchema, document, context);
  const stored = updated.joints.find((candidate) => candidate.id === id);
  if (stored === undefined) {
    throw new Error(`Joint "${id}" vanished while validating the document.`);
  }
  // The validated copy, e.g. with its name trimmed.
  return { document: updated, joint: stored };
}

// Tag keys already used in the assembly that `child` moves (ADR 0019): a tag
// key is unique there only. The assembly of a group child is the group itself.
function tagKeysNextTo(document: PantinDocument, child: JointEndpoint): Set<string> {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  return new Set(tagKeyOwners(document, endpointAssembly(child, assemblyOf)).keys());
}

export function addJointToDocument(
  document: PantinDocument,
  request: CreateJointRequest,
  positions: ReadonlyMap<string, number>,
): { document: PantinDocument; joint: Joint } {
  const takenIds = new Set(document.joints.map((joint) => joint.id));
  const baseKey = slugifyDisplayName(request.name, "joint");
  const id = makeUniqueId(baseKey, takenIds);
  const tagKey = makeUniqueId(baseKey, tagKeysNextTo(document, request.child));
  const joint: Joint = { id, tagKey, ...request };
  const added = addJoint(document, joint);
  refuseLinkProblem(added);
  refuseAnchorConflict(added, id);
  return validatedJoint(
    keepDisplayedPose(document, added, positions),
    id,
    "The Pantin with the new joint",
  );
}

// Every field of the request may change, the type included (ADR 0018); the
// id and the tag key, hence the tag names, stay.
export function updateJointInDocument(
  document: PantinDocument,
  jointId: string,
  request: CreateJointRequest,
  positions: ReadonlyMap<string, number>,
): { document: PantinDocument; joint: Joint } {
  const existing = document.joints.find((joint) => joint.id === jointId);
  if (existing === undefined) {
    throw new ApiError("not_found", `This Pantin has no joint "${jointId}".`);
  }
  // Checked against the other joints only: the joint may keep its own link.
  const others = removeJoint(document, jointId);
  if (request.type !== "continuous") {
    refuseDrumJointLoss(document, jointId, `become a ${request.type} joint`);
  }
  const joint: Joint = { id: jointId, tagKey: existing.tagKey, ...request };
  const replaced = replaceJoint(document, joint);
  refuseLinkProblem(replaced);
  refuseAnchorConflict(replaced, jointId);
  // A new child in another assembly may already use this tag key there.
  if (tagKeysNextTo(others, request.child).has(existing.tagKey)) {
    throw new ApiError(
      "invalid_request",
      `Tag key "${existing.tagKey}" of joint "${jointId}" is already used in assembly "${endpointAssemblyIn(request.child, document.bodies)}". Rename one of the tag keys first.`,
    );
  }
  if (JOINT_COORDINATE_UNITS[request.type] === null) {
    sensorsWatchingGuard(document, jointId);
  }
  // A joint whose coordinate unit changes restarts at 0 (ADR 0020): the
  // displayed pose after the edit is the one with that position forgotten.
  const kept = new Map(positions);
  if (!haveSameCoordinateUnit(existing, joint)) {
    kept.delete(jointId);
  }
  return validatedJoint(
    keepDisplayedPose(document, replaced, kept),
    jointId,
    "The Pantin with the changed joint",
  );
}

// A moved or watched joint cannot go: its actuator would move nothing, or a
// joint that is no longer there (ADR 0028 point 9, ADR 0023 point 5).
export function deleteJointFromDocument(
  document: PantinDocument,
  jointId: string,
  positions: ReadonlyMap<string, number>,
): PantinDocument {
  const actuator = document.actuators.find((candidate) => candidate.joints.includes(jointId));
  if (actuator !== undefined) {
    throw new ApiError(
      "conflict",
      `Joint "${jointId}" is moved by actuator "${actuator.id}". Remove it from the actuator, or delete the actuator, first.`,
    );
  }
  sensorsWatchingGuard(document, jointId);
  refuseDrumJointLoss(document, jointId, "be deleted");
  const removed = removeJoint(document, jointId);
  return parseWithSchema(
    PantinDocumentSchema,
    keepDisplayedPose(document, removed, positions),
    "The Pantin without the joint",
  );
}

// A sensor reads a joint's coordinate: the joint must keep one (ADR 0023 point 5).
function sensorsWatchingGuard(document: PantinDocument, jointId: string): void {
  const sensors = document.sensors.filter((sensor) => sensor.joint === jointId).map(({ id }) => id);
  if (sensors.length > 0) {
    throw new ApiError(
      "conflict",
      `Joint "${jointId}" is watched by sensor "${sensors.join('", "')}". Point the sensor at another joint, or delete it, first.`,
    );
  }
}
