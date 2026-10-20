import {
  compose,
  inverse,
  type Quaternion,
  type RigidTransform,
  scale,
  subtract,
  type Vector3,
} from "./rigid-transform.ts";

// Linear and angular velocity, in world axes, that carry a body from the pose
// it had to the pose it must have after `seconds`. The physics world gives a
// belt this velocity on top of its surface velocity, so a belt carried by a
// moving frame (a shuttle, a lift) drags what lies on it (ADR 0043 point 3).
// It comes from two consecutive poses of the fixed step (ADR 0005), never from
// a clock, so a run stays reproducible.
export type FrameVelocity = { linear: Vector3; angular: Vector3 };

// Rotation vector (axis times angle) of a unit quaternion, angle in [-pi, pi].
function rotationVector([x, y, z, w]: Quaternion): Vector3 {
  const sineHalf = Math.hypot(x, y, z);
  if (sineHalf === 0) {
    return [0, 0, 0];
  }
  // q and -q are the same rotation: take the short way round.
  const sign = w < 0 ? -1 : 1;
  const angle = 2 * Math.atan2(sineHalf, sign * w);
  const factor = (sign * angle) / sineHalf;
  return [x * factor, y * factor, z * factor];
}

export function frameVelocity(
  from: RigidTransform,
  to: RigidTransform,
  seconds: number,
): FrameVelocity {
  const turn = compose(to, inverse(from)).rotation;
  return {
    linear: scale(subtract(to.translation, from.translation), 1 / seconds),
    angular: scale(rotationVector(turn), 1 / seconds),
  };
}
