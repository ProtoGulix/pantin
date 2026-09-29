import {
  type CreateJointRequest,
  type Joint,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { addJoint, removeJoint, replaceJoint } from "./pantin-document.ts";
import { parseWithSchema } from "./validation.ts";

// Adding or changing a joint in a document (ADR 0011 point 3): the joints
// must stay a forest of known bodies. Pure: returns the new document and the
// stored joint.

function isAncestor(document: PantinDocument, candidate: string, bodyId: string): boolean {
  const parentOf = new Map(document.joints.map((joint) => [joint.child, joint.parent]));
  for (let current = parentOf.get(bodyId); current !== undefined; current = parentOf.get(current)) {
    if (current === candidate) {
      return true;
    }
  }
  return false;
}

function linkProblem(document: PantinDocument, request: CreateJointRequest): string | undefined {
  const bodyIds = new Set(document.bodies.map((body) => body.id));
  for (const [role, bodyId] of [
    ["parent", request.parent],
    ["child", request.child],
  ] as const) {
    if (!bodyIds.has(bodyId)) {
      return `The ${role} body "${bodyId}" does not exist in this Pantin. Pick one of its bodies.`;
    }
  }
  if (request.parent === request.child) {
    return `A joint cannot link body "${request.child}" to itself. Pick two different bodies.`;
  }
  const existing = document.joints.find((joint) => joint.child === request.child);
  if (existing !== undefined) {
    return `Body "${request.child}" already has the parent joint "${existing.id}"; a body has at most one. Delete that joint first.`;
  }
  if (isAncestor(document, request.child, request.parent)) {
    return `Body "${request.child}" already drives "${request.parent}" through other joints; linking them back would make a cycle.`;
  }
  return undefined;
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

// Tag keys already used by the joints whose child body is in the same
// assembly as `childId` (ADR 0019): a tag key is unique there only.
function tagKeysNextTo(document: PantinDocument, childId: string): Set<string> {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const assembly = assemblyOf.get(childId);
  return new Set(
    document.joints
      .filter((joint) => assemblyOf.get(joint.child) === assembly)
      .map((joint) => joint.tagKey),
  );
}

export function addJointToDocument(
  document: PantinDocument,
  request: CreateJointRequest,
): { document: PantinDocument; joint: Joint } {
  const problem = linkProblem(document, request);
  if (problem !== undefined) {
    throw new ApiError("invalid_request", problem);
  }
  const takenIds = new Set(document.joints.map((joint) => joint.id));
  const baseKey = slugifyDisplayName(request.name, "joint");
  const id = makeUniqueId(baseKey, takenIds);
  const tagKey = makeUniqueId(baseKey, tagKeysNextTo(document, request.child));
  const joint: Joint = { id, tagKey, ...request };
  return validatedJoint(addJoint(document, joint), id, "The Pantin with the new joint");
}

// Every field of the request may change, the type included (ADR 0018); the
// id and the tag key, hence the tag names, stay.
export function updateJointInDocument(
  document: PantinDocument,
  jointId: string,
  request: CreateJointRequest,
): { document: PantinDocument; joint: Joint } {
  const existing = document.joints.find((joint) => joint.id === jointId);
  if (existing === undefined) {
    throw new ApiError("not_found", `This Pantin has no joint "${jointId}".`);
  }
  // Checked against the other joints only: the joint may keep its own link.
  const others = removeJoint(document, jointId);
  const problem = linkProblem(others, request);
  if (problem !== undefined) {
    throw new ApiError("invalid_request", problem);
  }
  // A new child in another assembly may already use this tag key there.
  if (tagKeysNextTo(others, request.child).has(existing.tagKey)) {
    throw new ApiError(
      "invalid_request",
      `Tag key "${existing.tagKey}" of joint "${jointId}" is already used in the assembly of body "${request.child}". Rename one of the tag keys first.`,
    );
  }
  const joint: Joint = { id: jointId, tagKey: existing.tagKey, ...request };
  return validatedJoint(
    replaceJoint(document, joint),
    jointId,
    "The Pantin with the changed joint",
  );
}
