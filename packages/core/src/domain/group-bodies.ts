import {
  type Assembly,
  describeEndpoint,
  type GroupBodiesRequest,
  groupEndpoint,
  type Joint,
  type PantinDocument,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { newAssembly } from "./assemblies.ts";
import { findAssembly } from "./assembly-contents.ts";
import { isRigidWithAssembly, mapFramedItems, refuseBrokenLinks } from "./group-shared.ts";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { refuseJointInUse } from "./joint-rules.ts";
import { tagKeyOwners } from "./tag-keys.ts";

// Grouper (ADR 0055 point 6): one atomic command, everything is checked
// before anything changes. The group G is a child of A in the structure tree
// with the identity placement, held by one fixed joint A -> G. G's frame is
// A's frame, so no placement is rewritten and no pose moves, at any joint
// position: a member with no parent joint now follows G, which follows A.

export type GroupBodiesOutcome = {
  document: PantinDocument;
  group: Assembly;
  deletedJoints: Joint[];
};

type Members = { bodies: ReadonlySet<string>; assemblies: ReadonlySet<string> };

function refuseDuplicates(ids: readonly string[], what: string): void {
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) {
    throw new ApiError("invalid_request", `${what} "${duplicate}" is listed twice.`);
  }
}

// Members are the direct bodies and direct sub-assemblies of A: a body of
// another assembly would be moved by a command that does not say so.
function resolveMembers(
  document: PantinDocument,
  assemblyKey: string,
  request: GroupBodiesRequest,
): Members {
  refuseDuplicates(request.bodies, "Body");
  refuseDuplicates(request.assemblies, "Assembly");
  for (const bodyId of request.bodies) {
    const body = document.bodies.find((candidate) => candidate.id === bodyId);
    if (body === undefined) {
      throw new ApiError("not_found", `This Pantin has no body "${bodyId}".`);
    }
    if (body.assembly !== assemblyKey) {
      throw new ApiError(
        "conflict",
        `Body "${bodyId}" is in assembly "${body.assembly}", not in "${assemblyKey}": only direct bodies of "${assemblyKey}" can be grouped.`,
      );
    }
  }
  for (const key of request.assemblies) {
    const sub = findAssembly(document, key);
    if (sub.parent !== assemblyKey) {
      throw new ApiError(
        "conflict",
        `Assembly "${key}" is not a direct sub-assembly of "${assemblyKey}": only direct sub-assemblies of "${assemblyKey}" can be grouped.`,
      );
    }
  }
  return { bodies: new Set(request.bodies), assemblies: new Set(request.assemblies) };
}

type JointFate = "keep" | "delete" | "repoint";

type PlanContext = { document: PantinDocument; assemblyKey: string; members: Members };

// The joint that hangs a member from something outside the group.
function fateOfIncomingJoint(joint: Joint, childId: string, context: PlanContext): JointFate {
  const { document, assemblyKey, members } = context;
  const { parent } = joint;
  if (parent.kind === "body" && members.bodies.has(parent.id)) {
    return "keep";
  }
  if (!isRigidWithAssembly(document, parent, assemblyKey, members.bodies)) {
    const parentName = describeEndpoint(parent);
    throw new ApiError(
      "conflict",
      `Joint "${joint.id}" hangs body "${childId}" from ${parentName}, which moves inside "${assemblyKey}" and is not part of the group: the group would take it along. Add ${parentName} to the group, or delete joint "${joint.id}".`,
    );
  }
  return joint.type === "fixed" ? "delete" : "repoint";
}

function fateOfJoint(joint: Joint, context: PlanContext): JointFate {
  const { members } = context;
  const { parent, child } = joint;
  if (child.kind === "body" && members.bodies.has(child.id)) {
    return fateOfIncomingJoint(joint, child.id, context);
  }
  if (parent.kind === "body" && members.bodies.has(parent.id) && child.kind === "body") {
    throw new ApiError(
      "conflict",
      `Joint "${joint.id}" links body "${parent.id}", which is in the group, to body "${child.id}", which is not: the group would leave "${child.id}" behind. Add body "${child.id}" to the group, or delete joint "${joint.id}".`,
    );
  }
  return "keep";
}

function planJoints(context: PlanContext): { deleted: Joint[]; repointed: Set<string> } {
  const deleted: Joint[] = [];
  const repointed = new Set<string>();
  for (const joint of context.document.joints) {
    const fate = fateOfJoint(joint, context);
    if (fate === "delete") {
      deleted.push(joint);
    } else if (fate === "repoint") {
      repointed.add(joint.id);
    }
  }
  return { deleted, repointed };
}

// A joint whose parent is A and whose child is a member keeps its numbers: G's
// frame is A's frame.
function rewriteJoints(
  document: PantinDocument,
  group: Assembly,
  plan: ReturnType<typeof planJoints>,
): Joint[] {
  const deletedIds = new Set(plan.deleted.map(({ id }) => id));
  return document.joints
    .filter((joint) => !deletedIds.has(joint.id))
    .map((joint) =>
      plan.repointed.has(joint.id) ? { ...joint, parent: groupEndpoint(group.key) } : joint,
    );
}

// G goes right after A: parents stay before their children in the list.
function insertAfter(
  assemblies: readonly Assembly[],
  afterKey: string,
  group: Assembly,
): Assembly[] {
  return assemblies.flatMap((assembly) =>
    assembly.key === afterKey ? [assembly, group] : [assembly],
  );
}

// `takenIds` comes from the document before the deletions: the new id must
// differ from every deleted one, which the runtime forgets by id.
function holdingJoint(
  document: PantinDocument,
  group: Assembly,
  parentKey: string,
  takenIds: ReadonlySet<string>,
): Joint {
  const baseKey = slugifyDisplayName(group.name, "group");
  const takenTagKeys = new Set(tagKeyOwners(document, group.key).keys());
  return {
    id: makeUniqueId(baseKey, takenIds),
    tagKey: makeUniqueId(baseKey, takenTagKeys),
    type: "fixed",
    name: group.name,
    parent: groupEndpoint(parentKey),
    child: groupEndpoint(group.key),
    origin: [0, 0, 0],
    axis: [0, 0, 1],
  };
}

function applyGrouping(
  document: PantinDocument,
  assemblyKey: string,
  group: Assembly,
  members: Members,
  plan: ReturnType<typeof planJoints>,
): PantinDocument {
  const moved: PantinDocument = {
    ...document,
    assemblies: insertAfter(
      document.assemblies.map((assembly) =>
        members.assemblies.has(assembly.key) ? { ...assembly, parent: group.key } : assembly,
      ),
      assemblyKey,
      group,
    ),
    bodies: document.bodies.map((body) =>
      members.bodies.has(body.id) ? { ...body, assembly: group.key } : body,
    ),
    joints: rewriteJoints(document, group, plan),
  };
  // Objects follow a body of their own assembly only (ADR 0043 point 2).
  const withObjects = mapFramedItems(moved, (item) =>
    item.body !== undefined && members.bodies.has(item.body)
      ? { ...item, assembly: group.key }
      : item,
  );
  return {
    ...withObjects,
    joints: [
      ...withObjects.joints,
      holdingJoint(withObjects, group, assemblyKey, new Set(document.joints.map(({ id }) => id))),
    ],
  };
}

export function groupBodies(
  document: PantinDocument,
  assemblyKey: string,
  request: GroupBodiesRequest,
): GroupBodiesOutcome {
  findAssembly(document, assemblyKey);
  const members = resolveMembers(document, assemblyKey, request);
  const plan = planJoints({ document, assemblyKey, members });
  for (const joint of plan.deleted) {
    refuseJointInUse(document, joint.id);
  }
  const group = newAssembly(document, request.name, assemblyKey);
  const grouped = applyGrouping(document, assemblyKey, group, members, plan);
  refuseBrokenLinks(grouped);
  return { document: grouped, group, deletedJoints: plan.deleted };
}
