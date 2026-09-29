import type { BodyPose, Joint, PantinDocument } from "@pantin/protocol";
import {
  axisAngleRotation,
  compose,
  IDENTITY_ROTATION,
  IDENTITY_TRANSFORM,
  normalize,
  type RigidTransform,
  rotate,
  scale,
  subtract,
} from "./rigid-transform.ts";

// Pose of every body from the joint positions (ADR 0011 point 4): a body's
// pose is its rigid displacement from where it was imported,
// P(child) = P(parent) ∘ M(q). Bodies without a parent joint stay fixed.

// The core, not the viewer, keeps positions inside the limits (point 5).
export function clampJointPosition(joint: Joint, position: number): number {
  switch (joint.type) {
    case "fixed":
      return 0;
    case "continuous":
      return position;
    case "prismatic":
    case "revolute": {
      const [lower, upper] = joint.limits;
      return Math.min(upper, Math.max(lower, position));
    }
  }
}

// A joint never written since the Pantin was opened sits at 0, clamped so
// that limits excluding 0 still yield a position inside them.
export function currentJointPosition(joint: Joint, positions: ReadonlyMap<string, number>): number {
  return clampJointPosition(joint, positions.get(joint.id) ?? 0);
}

// M(q): the motion of a joint at position q, in the Pantin frame.
export function jointMotion(joint: Joint, position: number): RigidTransform {
  switch (joint.type) {
    case "fixed":
      return IDENTITY_TRANSFORM;
    case "prismatic":
      return { rotation: IDENTITY_ROTATION, translation: scale(normalize(joint.axis), position) };
    case "revolute":
    case "continuous": {
      // Rotation about the axis through `origin`: x -> R (x - o) + o.
      const rotation = axisAngleRotation(joint.axis, position);
      return { rotation, translation: subtract(joint.origin, rotate(rotation, joint.origin)) };
    }
  }
}

export function computePoses(
  document: PantinDocument,
  positions: ReadonlyMap<string, number>,
): BodyPose[] {
  const parentJointOf = new Map(document.joints.map((joint) => [joint.child, joint]));
  const poses = new Map<string, RigidTransform>();
  // Parents before children; the document schema guarantees a forest.
  const poseOf = (bodyId: string): RigidTransform => {
    const known = poses.get(bodyId);
    if (known !== undefined) {
      return known;
    }
    const joint = parentJointOf.get(bodyId);
    const pose =
      joint === undefined
        ? IDENTITY_TRANSFORM
        : compose(poseOf(joint.parent), jointMotion(joint, currentJointPosition(joint, positions)));
    poses.set(bodyId, pose);
    return pose;
  };
  return document.bodies.map((body) => {
    const { rotation, translation } = poseOf(body.id);
    return { bodyId: body.id, translation: [...translation], rotation: [...rotation] };
  });
}
