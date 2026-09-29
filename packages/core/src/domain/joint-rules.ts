import {
  type CreateJointRequest,
  type Joint,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { addJoint } from "./pantin-document.ts";
import { parseWithSchema } from "./validation.ts";

// Adding a joint to a document (ADR 0011 point 3): the joints must stay a
// forest of known bodies. Pure: returns the new document and the new joint.

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

export function addJointToDocument(
  document: PantinDocument,
  request: CreateJointRequest,
): { document: PantinDocument; joint: Joint } {
  const problem = linkProblem(document, request);
  if (problem !== undefined) {
    throw new ApiError("invalid_request", problem);
  }
  const takenIds = new Set(document.joints.map((joint) => joint.id));
  const id = makeUniqueId(slugifyDisplayName(request.name, "joint"), takenIds);
  const joint: Joint = { id, ...request };
  const updated = parseWithSchema(
    PantinDocumentSchema,
    addJoint(document, joint),
    "The Pantin with the new joint",
  );
  // The validated copy, e.g. with its name trimmed.
  const stored = updated.joints.find((candidate) => candidate.id === id) ?? joint;
  return { document: updated, joint: stored };
}
