import { type RigidTransform, rotate, type Vector3 } from "./rigid-transform.ts";

// Surface velocity of a belt in world axes (ADR 0043 point 3): +X of the belt's
// current world frame × drum radius × the drum joint's velocity of this step
// (rad/s, from the step's actuators; 0 for a jammed drum or one moved by a
// setpoint). Positive rotation moves the surface along +X.
export function beltSurfaceVelocity(
  beltWorld: RigidTransform,
  drumRadius: number,
  drumVelocity: number,
): Vector3 {
  const [x, y, z] = rotate(beltWorld.rotation, [1, 0, 0]);
  const speed = drumRadius * drumVelocity;
  return [x * speed, y * speed, z * speed];
}
