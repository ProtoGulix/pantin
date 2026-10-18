import {
  type Assembly,
  type Body,
  describeEndpoint,
  endpointAssembly,
  groupEndpoint,
  type Joint,
  type PantinDocument,
  type Placement,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { computeWorldPlacements, deriveAssemblyAnchors } from "./assembly-anchors.ts";
import { findAssembly } from "./assembly-contents.ts";
import { isRigidWithAssembly, mapFramedItems, refuseBrokenLinks } from "./group-shared.ts";
import { makeUniqueId } from "./ids.ts";
import { refuseJointInUse } from "./joint-rules.ts";
import {
  apply,
  compose,
  IDENTITY_TRANSFORM,
  inverse,
  isIdentityTransform,
  type RigidTransform,
  rotate,
  toPlacement,
  unitTransform,
} from "./rigid-transform.ts";
import { tagKeyOwners } from "./tag-keys.ts";

// Dégrouper (ADR 0055 point 7): the group G is dissolved into its structure
// parent A. Nothing may move, so it is allowed only when G is rigid with A:
// every body of G follows G today and follows A afterwards. What was written
// in G's frame is rewritten in A's frame, the way a body changing assembly
// is (ADR 0033 point 7).

export type UngroupOutcome = { document: PantinDocument; deletedJoints: Joint[] };

function refuse(message: string): never {
  throw new ApiError("conflict", message);
}

// The fixed joint that holds G to A, which goes with G; undefined when neither
// G nor A is moved by any joint. Anything else would change a pose.
function holdingJointOf(document: PantinDocument, group: Assembly, targetKey: string) {
  const anchors = deriveAssemblyAnchors(document);
  const anchor = anchors.get(group.key);
  if (anchor === undefined) {
    const targetAnchor = anchors.get(targetKey);
    if (targetAnchor !== undefined) {
      refuse(
        `Group "${group.key}" is not moved by any joint, but assembly "${targetKey}" is moved by joint "${targetAnchor.joint.id}": its bodies would start following "${targetKey}". Dissolve it when "${targetKey}" is not moved, or hold it with a fixed joint to "${targetKey}" first.`,
      );
    }
    return undefined;
  }
  const { joint } = anchor;
  if (joint.type !== "fixed") {
    refuse(
      `Group "${group.key}" is moved by joint "${joint.id}" (${joint.type}): its bodies would stop following it. Make joint "${joint.id}" fixed, or delete it, first.`,
    );
  }
  if (anchor.assembly !== targetKey) {
    refuse(
      `Group "${group.key}" is held by joint "${joint.id}" to assembly "${anchor.assembly}", not to "${targetKey}", the assembly it would dissolve into: its bodies would stop following it. Delete joint "${joint.id}" first, or change its parent.`,
    );
  }
  if (!isRigidWithAssembly(document, joint.parent, targetKey)) {
    refuse(
      `Group "${group.key}" hangs from ${describeEndpoint(joint.parent)} by joint "${joint.id}", which moves inside "${targetKey}": its bodies would stop following it. Change the parent of joint "${joint.id}" first.`,
    );
  }
  return joint;
}

// Moves G's keys into A's namespace: a key used on both sides is refused with
// a free one (ADR 0019).
function refuseTagKeyCollision(
  document: PantinDocument,
  group: Assembly,
  targetKey: string,
  holding: Joint | undefined,
): void {
  const inGroup = tagKeyOwners(document, group.key, holding ? { jointId: holding.id } : {});
  const inTarget = tagKeyOwners(document, targetKey);
  const taken = new Set([...inGroup.keys(), ...inTarget.keys()]);
  for (const [key, owner] of inGroup) {
    const clash = inTarget.get(key);
    if (clash !== undefined) {
      throw new ApiError(
        "conflict",
        `Tag key "${key}" of ${owner} is already used by ${clash} in assembly "${targetKey}", so ${owner} cannot move there. Rename one of them first; "${makeUniqueId(key, taken)}" is free.`,
      );
    }
  }
}

// W(A) ∘ F = W(G): a pose written in G's frame is F ∘ pose in A's.
function frameChangeOf(
  document: PantinDocument,
  group: Assembly,
  targetKey: string,
  holding: Joint | undefined,
): RigidTransform {
  if (holding !== undefined) {
    return unitTransform(group.placement);
  }
  const worlds = computeWorldPlacements(document);
  return compose(
    inverse(worlds.get(targetKey) ?? IDENTITY_TRANSFORM),
    worlds.get(group.key) ?? IDENTITY_TRANSFORM,
  );
}

// Skips the composition for an identity change, so a document grouped with the
// identity placement comes back exactly as it was.
function reframe(change: RigidTransform, placement: Placement): Placement {
  return isIdentityTransform(change)
    ? placement
    : toPlacement(compose(change, unitTransform(placement)));
}

function rehomedBody(body: Body, targetKey: string, change: RigidTransform): Body {
  const moved = { ...body, assembly: targetKey };
  if (isIdentityTransform(change)) {
    return moved;
  }
  const placement =
    body.placement === undefined ? toPlacement(change) : reframe(change, body.placement);
  return { ...moved, placement };
}

function rewriteJoints(
  document: PantinDocument,
  group: Assembly,
  targetKey: string,
  change: RigidTransform,
  holding: Joint | undefined,
): Joint[] {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  return document.joints
    .filter((joint) => joint.id !== holding?.id)
    .map((joint) => {
      if (endpointAssembly(joint.parent, assemblyOf) !== group.key) {
        return joint;
      }
      const parent = joint.parent.kind === "assembly" ? groupEndpoint(targetKey) : joint.parent;
      return isIdentityTransform(change)
        ? { ...joint, parent }
        : {
            ...joint,
            parent,
            origin: [...apply(change, joint.origin)],
            axis: [...rotate(change.rotation, joint.axis)],
          };
    });
}

function rewriteAssemblies(
  document: PantinDocument,
  group: Assembly,
  targetKey: string,
  change: RigidTransform,
): Assembly[] {
  const anchoredByGroup = new Set(
    [...deriveAssemblyAnchors(document)]
      .filter(([key, anchor]) => key !== group.key && anchor.assembly === group.key)
      .map(([key]) => key),
  );
  return document.assemblies
    .filter((assembly) => assembly.key !== group.key)
    .map((assembly) => ({
      ...assembly,
      ...(assembly.parent === group.key ? { parent: targetKey } : {}),
      ...(anchoredByGroup.has(assembly.key)
        ? { placement: reframe(change, assembly.placement) }
        : {}),
    }));
}

function moveOwners<Item extends { assembly: string }>(
  items: readonly Item[],
  from: string,
  to: string,
): Item[] {
  return items.map((item) => (item.assembly === from ? { ...item, assembly: to } : item));
}

function dissolve(
  document: PantinDocument,
  group: Assembly,
  targetKey: string,
  change: RigidTransform,
  holding: Joint | undefined,
): PantinDocument {
  const rehomed: PantinDocument = {
    ...document,
    assemblies: rewriteAssemblies(document, group, targetKey, change),
    bodies: document.bodies.map((body) =>
      body.assembly === group.key ? rehomedBody(body, targetKey, change) : body,
    ),
    joints: rewriteJoints(document, group, targetKey, change, holding),
    drives: moveOwners(document.drives, group.key, targetKey),
    actuators: moveOwners(document.actuators, group.key, targetKey),
    sensors: moveOwners(document.sensors, group.key, targetKey),
  };
  // An object that follows a body keeps its placement in that body's frame;
  // one that follows the assembly is rewritten into A's frame.
  return mapFramedItems(rehomed, (item) => {
    if (item.assembly !== group.key) {
      return item;
    }
    const placement = item.body === undefined ? reframe(change, item.placement) : item.placement;
    return { ...item, assembly: targetKey, placement };
  });
}

export function ungroup(document: PantinDocument, groupKey: string): UngroupOutcome {
  const group = findAssembly(document, groupKey);
  if (group.parent === undefined) {
    return refuse(
      `Assembly "${groupKey}" is at the top of the structure tree: there is no assembly to dissolve it into. Move it into an assembly first.`,
    );
  }
  const targetKey = group.parent;
  const holding = holdingJointOf(document, group, targetKey);
  if (holding !== undefined) {
    refuseJointInUse(document, holding.id);
  }
  refuseTagKeyCollision(document, group, targetKey, holding);
  const change = frameChangeOf(document, group, targetKey, holding);
  const dissolved = dissolve(document, group, targetKey, change, holding);
  refuseBrokenLinks(dissolved);
  return { document: dissolved, deletedJoints: holding === undefined ? [] : [holding] };
}
