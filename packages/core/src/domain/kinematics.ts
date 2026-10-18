import {
  type BodyPose,
  bodyEndpoint,
  endpointAssembly,
  endpointKey,
  groupEndpoint,
  type Joint,
  type JointEndpoint,
  type PantinDocument,
} from "@pantin/protocol";
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
// ADR 0033 and ADR 0055): D(child) = D(parent) ∘ M_world(q), the displacement
// of a body or a group from where it was placed. A body without a parent joint
// follows its group (ADR 0055 point 2). The pose sent per body is
// D(b) ∘ W(assembly(b)) ∘ B(b): the transform to apply to the mesh as its file
// places it.

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

// Origin and axis of a joint are in the frame of its parent's assembly,
// whose world placement is W: the motion in the world is W ∘ M_local ∘ W⁻¹.
function worldMotion(local: RigidTransform, assemblyWorld: RigidTransform): RigidTransform {
  if (isIdentityTransform(assemblyWorld)) {
    return local;
  }
  return compose(compose(assemblyWorld, local), inverse(assemblyWorld));
}

// D of every link: the displacement from where the reference places it.
// Exposed because the edits that keep the displayed pose need it (keep-displayed-pose.ts).
export type Displacements = {
  bodies: ReadonlyMap<string, RigidTransform>;
  groups: ReadonlyMap<string, RigidTransform>;
};

export function endpointDisplacement(
  displacements: Displacements,
  endpoint: JointEndpoint,
): RigidTransform {
  const found =
    endpoint.kind === "body"
      ? displacements.bodies.get(endpoint.id)
      : displacements.groups.get(endpoint.key);
  return found ?? IDENTITY_TRANSFORM;
}

// Links are bodies and groups (ADR 0055 point 2). A link with a parent joint
// is D(parent) ∘ M_world(q); one without follows its group, which is the
// identity when no joint moves that group. Parents come before children: the
// document schema guarantees there is no cycle.
export function computeDisplacements(
  document: PantinDocument,
  positions: ReadonlyMap<string, number>,
): Displacements {
  const parentJointOf = new Map(document.joints.map((joint) => [endpointKey(joint.child), joint]));
  const assemblyOfBody = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const worlds = computeWorldPlacements(document);
  const worldOfEndpoint = (endpoint: JointEndpoint): RigidTransform => {
    const assembly = endpointAssembly(endpoint, assemblyOfBody);
    return (assembly === undefined ? undefined : worlds.get(assembly)) ?? IDENTITY_TRANSFORM;
  };
  const bodies = new Map<string, RigidTransform>();
  const groups = new Map<string, RigidTransform>();
  const displacementOf = (endpoint: JointEndpoint): RigidTransform => {
    const [cache, id] = endpoint.kind === "body" ? [bodies, endpoint.id] : [groups, endpoint.key];
    const known = cache.get(id);
    if (known !== undefined) {
      return known;
    }
    const joint = parentJointOf.get(endpointKey(endpoint));
    let displacement = IDENTITY_TRANSFORM;
    if (joint !== undefined) {
      const motion = jointMotion(joint, currentJointPosition(joint, positions));
      displacement = compose(
        displacementOf(joint.parent),
        worldMotion(motion, worldOfEndpoint(joint.parent)),
      );
    } else if (endpoint.kind === "body") {
      displacement = displacementOf(groupEndpoint(assemblyOfBody.get(id) ?? ""));
    }
    cache.set(id, displacement);
    return displacement;
  };
  for (const assembly of document.assemblies) {
    displacementOf(groupEndpoint(assembly.key));
  }
  for (const body of document.bodies) {
    displacementOf(bodyEndpoint(body.id));
  }
  return { bodies, groups };
}

// `displacements` can be passed when the caller already has them, so that one
// step or response runs the joint chain once.
export function computePoses(
  document: PantinDocument,
  positions: ReadonlyMap<string, number>,
  displacements: Displacements = computeDisplacements(document, positions),
): BodyPose[] {
  const worlds = computeWorldPlacements(document);
  return document.bodies.map((body) => {
    const world = worlds.get(body.assembly) ?? IDENTITY_TRANSFORM;
    const reference = composeUnlessIdentity(
      world,
      body.placement === undefined ? IDENTITY_TRANSFORM : unitTransform(body.placement),
    );
    // The displacement is returned as is when the reference is identity, as
    // before ADR 0033.
    const displacement = displacements.bodies.get(body.id) ?? IDENTITY_TRANSFORM;
    const { rotation, translation } = isIdentityTransform(reference)
      ? displacement
      : compose(displacement, reference);
    return { bodyId: body.id, translation: [...translation], rotation: [...rotation] };
  });
}
