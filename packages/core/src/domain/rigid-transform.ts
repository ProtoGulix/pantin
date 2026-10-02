// Plain vector, quaternion and rigid transform algebra (ADR 0011 point 8).
// Quaternions are [x, y, z, w], unit length for rotations.

export type Vector3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];
export type RigidTransform = { rotation: Quaternion; translation: Vector3 };

export const IDENTITY_ROTATION: Quaternion = [0, 0, 0, 1];
export const IDENTITY_TRANSFORM: RigidTransform = {
  rotation: IDENTITY_ROTATION,
  translation: [0, 0, 0],
};

function add([ax, ay, az]: Vector3, [bx, by, bz]: Vector3): Vector3 {
  return [ax + bx, ay + by, az + bz];
}

export function subtract([ax, ay, az]: Vector3, [bx, by, bz]: Vector3): Vector3 {
  return [ax - bx, ay - by, az - bz];
}

export function scale([x, y, z]: Vector3, factor: number): Vector3 {
  return [x * factor, y * factor, z * factor];
}

export function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector);
  if (length === 0) {
    throw new Error("Cannot normalize the zero vector.");
  }
  return scale(vector, 1 / length);
}

export function axisAngleRotation(axis: Vector3, angle: number): Quaternion {
  const [x, y, z] = normalize(axis);
  const sine = Math.sin(angle / 2);
  return [x * sine, y * sine, z * sine, Math.cos(angle / 2)];
}

// Hamilton product: rotating by `second` then by `first`.
function multiply(first: Quaternion, second: Quaternion): Quaternion {
  const [ax, ay, az, aw] = first;
  const [bx, by, bz, bw] = second;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function rotate(rotation: Quaternion, vector: Vector3): Vector3 {
  const [qx, qy, qz, qw] = rotation;
  const [vx, vy, vz] = vector;
  // v' = v + 2w (q × v) + 2 q × (q × v), with q the vector part.
  const cx = qy * vz - qz * vy;
  const cy = qz * vx - qx * vz;
  const cz = qx * vy - qy * vx;
  return [
    vx + 2 * (qw * cx + qy * cz - qz * cy),
    vy + 2 * (qw * cy + qz * cx - qx * cz),
    vz + 2 * (qw * cz + qx * cy - qy * cx),
  ];
}

export function apply(transform: RigidTransform, point: Vector3): Vector3 {
  return add(rotate(transform.rotation, point), transform.translation);
}

// first ∘ second: apply `second`, then `first`.
export function compose(first: RigidTransform, second: RigidTransform): RigidTransform {
  return {
    rotation: multiply(first.rotation, second.rotation),
    translation: apply(first, second.translation),
  };
}

// The inverse of a rigid transform: the conjugate of a unit quaternion is its
// inverse, so no division is needed.
export function inverse({ rotation, translation }: RigidTransform): RigidTransform {
  const [x, y, z, w] = rotation;
  const inverseRotation: Quaternion = [-x, -y, -z, w];
  const [tx, ty, tz] = rotate(inverseRotation, translation);
  return { rotation: inverseRotation, translation: [-tx, -ty, -tz] };
}

// Exact comparison on purpose: callers use it to skip a composition that
// would only add rounding (see kinematics.ts).
export function isIdentityTransform({ rotation, translation }: RigidTransform): boolean {
  return (
    rotation[0] === 0 &&
    rotation[1] === 0 &&
    rotation[2] === 0 &&
    rotation[3] === 1 &&
    translation[0] === 0 &&
    translation[1] === 0 &&
    translation[2] === 0
  );
}

// The schema lets a stored quaternion be up to 1e-6 off unit length, while
// `inverse` and `rotate` assume a unit one. Documents are read as they are on
// disk (a JSON Schema cannot hold a transform), so the core normalises where
// it uses a placement. Left alone within rounding noise so that a document
// with exact placements keeps its poses bit for bit.
const UNIT_LENGTH_NOISE = 1e-12;

export function unitTransform({ rotation, translation }: RigidTransform): RigidTransform {
  const length = Math.hypot(...rotation);
  if (Math.abs(length - 1) <= UNIT_LENGTH_NOISE) {
    return { rotation, translation };
  }
  const [x, y, z, w] = rotation;
  return { rotation: [x / length, y / length, z / length, w / length], translation };
}

// A transform as the plain arrays a document stores (a Placement).
export function toPlacement({ rotation, translation }: RigidTransform): {
  rotation: [number, number, number, number];
  translation: [number, number, number];
} {
  return { rotation: [...rotation], translation: [...translation] };
}
