import type { BodyPose, Joint, PantinDocument } from "@pantin/protocol";
import { computeWorldPlacements } from "./assembly-anchors.ts";
import { clampJointPosition, jointMotion } from "./joint-types/registry.ts";
import {
  compose,
  IDENTITY_TRANSFORM,
  inverse,
  isIdentityTransform,
  type RigidTransform,
  unitTransform,
} from "./rigid-transform.ts";

// Pose of every body from the joint positions (ADR 0011 point 4, amended by
// ADR 0033): D(child) = D(parent) ∘ M_world(q), the displacement of a body
// from where it was placed. Bodies without a parent joint stay fixed. The
// pose sent per body is D(b) ∘ W(assembly(b)) ∘ B(b): the transform to apply
// to the mesh as its file places it.

// A joint never written since the Pantin was opened sits at 0, clamped so
// that limits excluding 0 still yield a position inside them.
export function currentJointPosition(joint: Joint, positions: ReadonlyMap<string, number>): number {
  return clampJointPosition(joint, positions.get(joint.id) ?? 0);
}

// Composing with an identity is mathematically a no-op but not bit for bit
// (-0, rounding): skipping it, here and in worldMotion, keeps every pose of a
// document whose placements are identity exactly what it was before ADR 0033.
function composeUnlessIdentity(first: RigidTransform, second: RigidTransform): RigidTransform {
  if (isIdentityTransform(first)) {
    return second;
  }
  return isIdentityTransform(second) ? first : compose(first, second);
}

// Origin and axis of a joint are in the frame of its parent body's assembly,
// whose world placement is W: the motion in the world is W ∘ M_local ∘ W⁻¹.
function worldMotion(local: RigidTransform, assemblyWorld: RigidTransform): RigidTransform {
  if (isIdentityTransform(assemblyWorld)) {
    return local;
  }
  return compose(compose(assemblyWorld, local), inverse(assemblyWorld));
}

// D(b) of every body: the displacement from where the reference places it.
// Exposed because the edits that keep the displayed pose need it (keep-displayed-pose.ts).
export function computeDisplacements(
  document: PantinDocument,
  positions: ReadonlyMap<string, number>,
): Map<string, RigidTransform> {
  const parentJointOf = new Map(document.joints.map((joint) => [joint.child, joint]));
  const bodyById = new Map(document.bodies.map((body) => [body.id, body]));
  const worlds = computeWorldPlacements(document);
  const worldOfBody = (bodyId: string): RigidTransform => {
    const assembly = bodyById.get(bodyId)?.assembly;
    return (assembly === undefined ? undefined : worlds.get(assembly)) ?? IDENTITY_TRANSFORM;
  };
  const displacements = new Map<string, RigidTransform>();
  // Parents before children; the document schema guarantees a forest.
  const displacementOf = (bodyId: string): RigidTransform => {
    const known = displacements.get(bodyId);
    if (known !== undefined) {
      return known;
    }
    const joint = parentJointOf.get(bodyId);
    const displacement =
      joint === undefined
        ? IDENTITY_TRANSFORM
        : compose(
            displacementOf(joint.parent),
            worldMotion(
              jointMotion(joint, currentJointPosition(joint, positions)),
              worldOfBody(joint.parent),
            ),
          );
    displacements.set(bodyId, displacement);
    return displacement;
  };
  for (const body of document.bodies) {
    displacementOf(body.id);
  }
  return displacements;
}

export function computePoses(
  document: PantinDocument,
  positions: ReadonlyMap<string, number>,
): BodyPose[] {
  const worlds = computeWorldPlacements(document);
  const displacements = computeDisplacements(document, positions);
  return document.bodies.map((body) => {
    const world = worlds.get(body.assembly) ?? IDENTITY_TRANSFORM;
    const reference = composeUnlessIdentity(
      world,
      body.placement === undefined ? IDENTITY_TRANSFORM : unitTransform(body.placement),
    );
    // The displacement is returned as is when the reference is identity, as
    // before ADR 0033.
    const displacement = displacements.get(body.id) ?? IDENTITY_TRANSFORM;
    const { rotation, translation } = isIdentityTransform(reference)
      ? displacement
      : compose(displacement, reference);
    return { bodyId: body.id, translation: [...translation], rotation: [...rotation] };
  });
}
