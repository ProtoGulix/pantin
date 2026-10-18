import {
  endpointKey,
  type Joint,
  type JointEndpoint,
  jointTreeIssues,
  type PantinDocument,
  type Placement,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { findAnchorConflict } from "./anchor-conflicts.ts";

// What Grouper and Dégrouper share (ADR 0055 points 6 and 7): the rigidity
// test, the refusal of a result that breaks the joint rules, and the edit of
// the objects that hang from an assembly.

function parentJointOf(document: PantinDocument, endpoint: JointEndpoint): Joint | undefined {
  const wanted = endpointKey(endpoint);
  return document.joints.find((joint) => endpointKey(joint.child) === wanted);
}

/**
 * Whether `endpoint` stays still relative to the group `assemblyKey`: that
 * group itself, or a body of it that follows it (no parent joint, or a chain
 * of fixed joints up to one). A body in `apart` is not counted, e.g. the
 * members of a group being made.
 */
export function isRigidWithAssembly(
  document: PantinDocument,
  endpoint: JointEndpoint,
  assemblyKey: string,
  apart: ReadonlySet<string> = new Set(),
): boolean {
  let current = endpoint;
  for (;;) {
    if (current.kind === "assembly") {
      return current.key === assemblyKey;
    }
    if (apart.has(current.id)) {
      return false;
    }
    const joint = parentJointOf(document, current);
    if (joint === undefined) {
      return true;
    }
    if (joint.type !== "fixed") {
      return false;
    }
    current = joint.parent;
  }
}

/**
 * Refuses a result that breaks the joint rules (ADR 0055 point 4) or the
 * anchor rules (ADR 0033 point 2) with a conflict: the user asked for a
 * combination the document cannot hold, so the document is what is in the way.
 */
export function refuseBrokenLinks(result: PantinDocument): void {
  const [issue] = jointTreeIssues(result);
  if (issue !== undefined) {
    throw new ApiError("conflict", issue.message);
  }
  const anchorConflict = findAnchorConflict(result, new Set());
  if (anchorConflict !== undefined) {
    throw new ApiError("conflict", anchorConflict);
  }
}

type FramedItem = { assembly: string; body?: string | undefined; placement: Placement };

/** Applies `change` to every belt, guide, emitter, absorber and presence sensor. */
export function mapFramedItems(
  document: PantinDocument,
  change: <Item extends FramedItem>(item: Item) => Item,
): PantinDocument {
  return {
    ...document,
    belts: document.belts.map(change),
    guides: document.guides.map(change),
    emitters: document.emitters.map(change),
    absorbers: document.absorbers.map(change),
    presenceSensors: document.presenceSensors.map(change),
  };
}
