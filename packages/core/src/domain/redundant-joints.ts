import {
  endpointAssembly,
  endpointKey,
  type Joint,
  type JointEndpoint,
  type KeptJoint,
  type ListedJoint,
  type PantinDocument,
  type RedundantJointsList,
} from "@pantin/protocol";
import { isRigidWithAssembly } from "./group-shared.ts";
import { removeJoints } from "./pantin-document.ts";

// The fixed joints that groups made redundant (ADR 0060). A fixed joint
// between a parent and a child body of one assembly changes no pose when the
// parent already follows the assembly's group: the child then follows the
// group by itself (ADR 0055 point 2).

type Candidate = { joint: Joint; assemblyKey: string };

// Only joints inside one assembly: a fixed joint between two assemblies
// anchors its child group, so deleting it would move that group.
function candidatesOf(document: PantinDocument): Candidate[] {
  const assemblyOfBody = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const candidates: Candidate[] = [];
  for (const joint of document.joints) {
    if (joint.type !== "fixed" || joint.child.kind !== "body") {
      continue;
    }
    const childAssembly = endpointAssembly(joint.child, assemblyOfBody);
    if (
      childAssembly !== undefined &&
      endpointAssembly(joint.parent, assemblyOfBody) === childAssembly
    ) {
      candidates.push({ joint, assemblyKey: childAssembly });
    }
  }
  return candidates;
}

// The protocol refuses a fixed joint for all three, so this is a guard for a
// document built by hand.
function userOf(document: PantinDocument, jointId: string): KeptJoint["by"] | undefined {
  const actuator = document.actuators.find((candidate) => candidate.joints.includes(jointId));
  if (actuator !== undefined) {
    return { kind: "actuator", id: actuator.id, name: actuator.name };
  }
  const sensor = document.sensors.find((candidate) => candidate.joint === jointId);
  if (sensor !== undefined) {
    return { kind: "sensor", id: sensor.id, name: sensor.name };
  }
  const belt = document.belts.find((candidate) => candidate.drumJoint === jointId);
  return belt === undefined ? undefined : { kind: "belt", id: belt.id, name: belt.name };
}

// The nearest joint that moves, going up from `endpoint` through fixed joints.
function nearestMovingJoint(document: PantinDocument, endpoint: JointEndpoint): Joint | undefined {
  let current = endpoint;
  for (;;) {
    const wanted = endpointKey(current);
    const parentJoint = document.joints.find((joint) => endpointKey(joint.child) === wanted);
    if (parentJoint === undefined) {
      return undefined;
    }
    if (parentJoint.type !== "fixed") {
      return parentJoint;
    }
    current = parentJoint.parent;
  }
}

// A parent that is not rigid with its assembly has a non-fixed joint on its
// chain, so a missing one means a broken invariant of isRigidWithAssembly:
// failing loudly beats naming the wrong joint as the cause.
function movingParentOf(document: PantinDocument, joint: Joint): KeptJoint["by"] {
  const moving = nearestMovingJoint(document, joint.parent);
  if (moving === undefined) {
    throw new Error(
      `Fixed joint "${joint.id}" has a parent that is not rigid with its assembly but no moving joint above it.`,
    );
  }
  return { kind: "joint", id: moving.id, name: moving.name };
}

type Classified = {
  redundant: Candidate[];
  kept: { candidate: Candidate; by: KeptJoint["by"]; reason: KeptJoint["reason"] }[];
};

function classify(document: PantinDocument): Classified {
  const classified: Classified = { redundant: [], kept: [] };
  for (const candidate of candidatesOf(document)) {
    const { joint, assemblyKey } = candidate;
    const user = userOf(document, joint.id);
    if (user !== undefined) {
      classified.kept.push({ candidate, by: user, reason: "in_use" });
    } else if (isRigidWithAssembly(document, joint.parent, assemblyKey)) {
      classified.redundant.push(candidate);
    } else {
      classified.kept.push({
        candidate,
        by: movingParentOf(document, joint),
        reason: "moving_parent",
      });
    }
  }
  return classified;
}

function listed(document: PantinDocument, { joint, assemblyKey }: Candidate): ListedJoint {
  const assembly = document.assemblies.find((candidate) => candidate.key === assemblyKey);
  return {
    id: joint.id,
    name: joint.name,
    assembly: { key: assemblyKey, name: assembly?.name ?? assemblyKey },
  };
}

// Assembly name, then joint name, then id so that the order never depends on
// the order of the file.
function byAssemblyThenName(first: ListedJoint, second: ListedJoint): number {
  return (
    first.assembly.name.localeCompare(second.assembly.name) ||
    first.name.localeCompare(second.name) ||
    first.id.localeCompare(second.id)
  );
}

export function findRedundantFixedJoints(document: PantinDocument): RedundantJointsList {
  const { redundant, kept } = classify(document);
  return {
    redundant: redundant.map((candidate) => listed(document, candidate)).sort(byAssemblyThenName),
    kept: kept
      .map(({ candidate, by, reason }) => ({ ...listed(document, candidate), reason, by }))
      .sort(byAssemblyThenName),
  };
}

export type RedundantJointsDeletion = {
  document: PantinDocument;
  deletedJoints: Joint[];
  skipped: string[];
};

/**
 * Deletes the requested joints that are redundant now and reports the others:
 * the list the user confirmed may be stale (ADR 0060 point 4).
 */
export function deleteRedundantFixedJoints(
  document: PantinDocument,
  jointIds: readonly string[],
): RedundantJointsDeletion {
  const redundantIds = new Set(classify(document).redundant.map(({ joint }) => joint.id));
  const requested = new Set(jointIds);
  const deleted = new Set([...requested].filter((id) => redundantIds.has(id)));
  return {
    document: removeJoints(document, deleted),
    deletedJoints: document.joints.filter((joint) => deleted.has(joint.id)),
    skipped: [...requested].filter((id) => !deleted.has(id)),
  };
}
