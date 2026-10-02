import type { Vector3Tuple } from "../frames.ts";

// The normal of a picked triangle, turned toward the eye (ADR 0035 point 3):
// a face the user clicked is seen from outside, so its outward normal points
// to the camera, whatever the winding of the mesh says.
export function normalFacingEye(
  normal: Vector3Tuple,
  point: Vector3Tuple,
  eye: Vector3Tuple,
): Vector3Tuple {
  const [x, y, z] = normal;
  const facing = x * (eye[0] - point[0]) + y * (eye[1] - point[1]) + z * (eye[2] - point[2]);
  return facing < 0 ? [-x, -y, -z] : normal;
}
