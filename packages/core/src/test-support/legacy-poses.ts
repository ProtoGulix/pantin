import type { Assembly, Body, BodyPose, Joint } from "@pantin/protocol";
import { jointMotion } from "../domain/joint-types/registry.ts";
import { currentJointPosition } from "../domain/kinematics.ts";
import {
  compose,
  IDENTITY_TRANSFORM,
  inverse,
  isIdentityTransform,
  type RigidTransform,
  unitTransform,
} from "../domain/rigid-transform.ts";

// The poses of a version 12 document, computed the way the core did before
// ADR 0055: joints link bodies, a body without a parent joint never moves, an
// assembly is anchored by the joint between assemblies whose child body it
// holds. A frozen copy of the old algorithm, the oracle for "poses are the
// same bit for bit before and after the migration to version 13".
//
// What is frozen is the topology and the composition of transforms, which
// ADR 0055 changes. The motion of each joint type (`jointMotion`) and the
// clamping of a position (`currentJointPosition`) stay live on purpose: the
// slice leaves them untouched, and copying the five joint types here would
// only duplicate code that this comparison does not test.

// `joint` carries the type, origin, axis and limits (what the motion needs);
// the two ids are the old body-to-body ends.
export type LegacyLink = { joint: Joint; parentBody: string; childBody: string };

function worldPlacements(
  assemblies: readonly Assembly[],
  assemblyOf: ReadonlyMap<string, string>,
  links: readonly LegacyLink[],
): Map<string, RigidTransform> {
  const anchorOf = new Map<string, string>();
  for (const { parentBody, childBody } of links) {
    const [from, to] = [assemblyOf.get(parentBody), assemblyOf.get(childBody)];
    if (from !== undefined && to !== undefined && from !== to) {
      anchorOf.set(to, from);
    }
  }
  const placementOf = new Map(assemblies.map((item) => [item.key, unitTransform(item.placement)]));
  const worlds = new Map<string, RigidTransform>();
  const worldOf = (key: string): RigidTransform => {
    const known = worlds.get(key);
    if (known !== undefined) {
      return known;
    }
    const own = placementOf.get(key) ?? IDENTITY_TRANSFORM;
    const anchor = anchorOf.get(key);
    const world = anchor === undefined ? own : compose(worldOf(anchor), own);
    worlds.set(key, world);
    return world;
  };
  for (const item of assemblies) {
    worldOf(item.key);
  }
  return worlds;
}

function composeUnlessIdentity(first: RigidTransform, second: RigidTransform): RigidTransform {
  if (isIdentityTransform(first)) {
    return second;
  }
  return isIdentityTransform(second) ? first : compose(first, second);
}

export function legacyPoses(
  assemblies: readonly Assembly[],
  bodies: readonly Body[],
  links: readonly LegacyLink[],
  positions: ReadonlyMap<string, number>,
): BodyPose[] {
  const assemblyOf = new Map(bodies.map((body) => [body.id, body.assembly]));
  const worlds = worldPlacements(assemblies, assemblyOf, links);
  const worldOfBody = (bodyId: string) =>
    worlds.get(assemblyOf.get(bodyId) ?? "") ?? IDENTITY_TRANSFORM;
  const linkOf = new Map(links.map((link) => [link.childBody, link]));
  const displacements = new Map<string, RigidTransform>();
  const displacementOf = (bodyId: string): RigidTransform => {
    const known = displacements.get(bodyId);
    if (known !== undefined) {
      return known;
    }
    const link = linkOf.get(bodyId);
    let displacement = IDENTITY_TRANSFORM;
    if (link !== undefined) {
      const local = jointMotion(link.joint, currentJointPosition(link.joint, positions));
      const world = worldOfBody(link.parentBody);
      const motion = isIdentityTransform(world)
        ? local
        : compose(compose(world, local), inverse(world));
      displacement = compose(displacementOf(link.parentBody), motion);
    }
    displacements.set(bodyId, displacement);
    return displacement;
  };
  return bodies.map((body) => {
    const reference = composeUnlessIdentity(
      worldOfBody(body.id),
      body.placement === undefined ? IDENTITY_TRANSFORM : unitTransform(body.placement),
    );
    const displacement = displacementOf(body.id);
    const { rotation, translation } = isIdentityTransform(reference)
      ? displacement
      : compose(displacement, reference);
    return { bodyId: body.id, translation: [...translation], rotation: [...rotation] };
  });
}
