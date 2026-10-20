import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { frameVelocity } from "../domain/frame-velocity.ts";
import type { BeltState } from "../domain/physics-world.ts";
import { add, apply, type RigidTransform, type Vector3 } from "../domain/rigid-transform.ts";

// Thickness of the belt cuboid under its surface, in metres. A product falling
// at 5 m/s moves 4 cm in a 1/120 s step, so 5 cm cannot be crossed in one step,
// while the cuboid stays shallow enough not to touch what lies under the belt.
export const BELT_THICKNESS = 0.05;

// Rapier keeps poses in single precision. The target is rounded the same way,
// so a belt that stays where it is gets exactly no frame velocity instead of
// the 1e-5 m/s that the rounding difference would give.
export function toSinglePrecision({ translation, rotation }: RigidTransform): RigidTransform {
  const [x, y, z] = translation;
  const [qx, qy, qz, qw] = rotation;
  return {
    translation: [Math.fround(x), Math.fround(y), Math.fround(z)],
    rotation: [Math.fround(qx), Math.fround(qy), Math.fround(qz), Math.fround(qw)],
  };
}

// The belt body's pose for a frame pose: the cuboid hangs under the frame origin.
export function beltBodyPose(framePose: RigidTransform): RigidTransform {
  return {
    rotation: framePose.rotation,
    translation: apply(framePose, [0, 0, -BELT_THICKNESS / 2]),
  };
}

// Velocities that take a belt body from `previous`, where the last step left
// it, to its new frame pose within one step: the surface velocity plus the
// frame's own motion (ADR 0043, amendment 2026-10-20).
export function beltBodyVelocities(
  previous: RigidTransform,
  belt: BeltState,
): { linear: Vector3; angular: Vector3 } {
  const frame = frameVelocity(previous, toSinglePrecision(beltBodyPose(belt.pose)), STEP_SECONDS);
  return { linear: add(belt.surfaceVelocity, frame.linear), angular: frame.angular };
}
