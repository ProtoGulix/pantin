import type { QuaternionTuple, Vector3Tuple } from "./frames.ts";

// Display arithmetic in the core frame (like frames.ts, no simulation).
//
// ADR 0033: a joint's origin and axis are expressed in the frame of its parent
// body's ASSEMBLY (W), while the pose of a body moves the mesh as its file
// places it: pose = D . W . B, with B the optional placement of the body in
// its assembly. A marker that hangs from the parent body and follows its pose
// therefore has to be given the origin and axis seen from the body's own file
// frame, which is B^-1 applied to them; D . W . B . B^-1 . o = D . W . o.

// A Placement of the protocol fits; readonly so that tests and callers need no copy.
export interface RigidPlacement {
  translation: Vector3Tuple;
  rotation: QuaternionTuple;
}

export interface DrawnFrame {
  origin: Vector3Tuple;
  axis: Vector3Tuple;
}

function conjugate([x, y, z, w]: QuaternionTuple): QuaternionTuple {
  return [-x, -y, -z, w];
}

// Rotation of a vector by a unit quaternion: v + 2w(u x v) + 2 u x (u x v).
function rotate([x, y, z, w]: QuaternionTuple, [vx, vy, vz]: Vector3Tuple): Vector3Tuple {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/**
 * Origin and axis (frame of the parent body's assembly) as seen from the
 * parent body's file frame. Identity for a body without placement, which
 * returns the very same values.
 */
export function inBodyFrame(
  origin: Vector3Tuple,
  axis: Vector3Tuple,
  bodyPlacement: RigidPlacement | undefined,
): DrawnFrame {
  if (bodyPlacement === undefined) {
    return { origin, axis };
  }
  const inverse = conjugate(bodyPlacement.rotation);
  const [tx, ty, tz] = bodyPlacement.translation;
  return {
    origin: rotate(inverse, [origin[0] - tx, origin[1] - ty, origin[2] - tz]),
    axis: rotate(inverse, axis),
  };
}
