import { multiplyQuaternions, type QuaternionTuple, type Vector3Tuple } from "./frames.ts";

// Rigid transforms of the core frame (x -> R x + t, quaternion [x, y, z, w]),
// the same representation as a pose or a placement (ADR 0011 point 4). Display
// arithmetic only, like frames.ts: the viewer composes frames to draw and to
// turn a dragged gizmo into a placement, it simulates nothing.

export interface RigidTransform {
  translation: Vector3Tuple;
  rotation: QuaternionTuple;
}

export const IDENTITY_TRANSFORM: RigidTransform = {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
};

export function conjugate([x, y, z, w]: QuaternionTuple): QuaternionTuple {
  return [-x, -y, -z, w];
}

// Rotation of a vector by a unit quaternion: v + 2w(u x v) + 2 u x (u x v).
export function rotateVector(
  [x, y, z, w]: QuaternionTuple,
  [vx, vy, vz]: Vector3Tuple,
): Vector3Tuple {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/** outer . inner: `inner` is applied first. */
export function composeTransforms(outer: RigidTransform, inner: RigidTransform): RigidTransform {
  const moved = rotateVector(outer.rotation, inner.translation);
  return {
    translation: [
      outer.translation[0] + moved[0],
      outer.translation[1] + moved[1],
      outer.translation[2] + moved[2],
    ],
    rotation: multiplyQuaternions(outer.rotation, inner.rotation),
  };
}

export function invertTransform(transform: RigidTransform): RigidTransform {
  const rotation = conjugate(transform.rotation);
  const [x, y, z] = rotateVector(rotation, transform.translation);
  return { translation: [-x, -y, -z], rotation };
}

/** The unit quaternion of the same rotation, so that float noise never builds up. */
export function normalizedRotation(rotation: QuaternionTuple): QuaternionTuple {
  const length = Math.hypot(...rotation);
  return [rotation[0] / length, rotation[1] / length, rotation[2] / length, rotation[3] / length];
}
