import {
  add,
  axisAngleRotation,
  compose,
  IDENTITY_ROTATION,
  normalize,
  type Quaternion,
  type RigidTransform,
  rotate,
  scale,
  subtract,
  type Vector3,
} from "../rigid-transform.ts";

// Geometry shared by the alignment motions (ADR 0035 points 4 and 5).

// How far from ±1 a dot product of unit directions may be and still count as
// parallel (1e-9 on the cosine is about 4.5e-5 rad, 4.5 µm at 100 mm), and
// how close a point may be to an axis and still lie on it. Faces come from
// exact B-rep geometry, so only rounding has to be absorbed.
export const DIRECTION_EPSILON = 1e-9;
export const LENGTH_EPSILON = 1e-9;

// A connector frame (ADR 0035 point 4): an origin and a unit Z direction.
export type ConnectorFrame = { origin: Vector3; direction: Vector3 };

export function dot([ax, ay, az]: Vector3, [bx, by, bz]: Vector3): number {
  return ax * bx + ay * by + az * bz;
}

function cross([ax, ay, az]: Vector3, [bx, by, bz]: Vector3): Vector3 {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

// The part of `vector` perpendicular to the unit direction `axis`.
export function perpendicularPart(vector: Vector3, axis: Vector3): Vector3 {
  return subtract(vector, scale(axis, dot(vector, axis)));
}

// The Pantin frame axis least aligned with `direction`, ties broken in the
// order X, Y, Z (ADR 0035 point 5).
function leastAlignedAxis(direction: Vector3): Vector3 {
  const axes: Vector3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  let best: Vector3 = [1, 0, 0];
  let bestAlignment = Number.POSITIVE_INFINITY;
  for (const axis of axes) {
    const alignment = Math.abs(dot(direction, axis));
    if (alignment < bestAlignment) {
      best = axis;
      bestAlignment = alignment;
    }
  }
  return best;
}

// The minimal rotation taking unit `from` to unit `to`. Antiparallel
// directions have no unique axis: a half turn about from × e, e being the
// frame axis least aligned with `from`.
export function minimalRotation(from: Vector3, to: Vector3): Quaternion {
  const cosine = dot(from, to);
  if (cosine >= 1 - DIRECTION_EPSILON) {
    return IDENTITY_ROTATION;
  }
  if (cosine <= -1 + DIRECTION_EPSILON) {
    return axisAngleRotation(normalize(cross(from, leastAlignedAxis(from))), Math.PI);
  }
  return axisAngleRotation(normalize(cross(from, to)), Math.acos(cosine));
}

// Rotating by `rotation` about `point`: x -> R (x - p) + p.
function rotationAbout(point: Vector3, rotation: Quaternion): RigidTransform {
  return { rotation, translation: subtract(point, rotate(rotation, point)) };
}

function translationBy(vector: Vector3): RigidTransform {
  return { rotation: IDENTITY_ROTATION, translation: vector };
}

// Turning by `angle` radians about the line through `point` along unit `axis`.
export function turnAbout(point: Vector3, axis: Vector3, angle: number): RigidTransform {
  return angle === 0
    ? { rotation: IDENTITY_ROTATION, translation: [0, 0, 0] }
    : rotationAbout(point, axisAngleRotation(axis, angle));
}

// The signed angle about unit `axis` from `from` to `to`, both perpendicular
// to it, in (-π, π].
export function signedAngleAbout(from: Vector3, to: Vector3, axis: Vector3): number {
  return Math.atan2(dot(axis, cross(from, to)), dot(from, to));
}

// The three steps of ADR 0035 point 5: minimal rotation about the moving
// origin taking its direction to `wanted`, then `translation`, then a turn by
// `angle` about the line through the moved origin along `turnAxis`.
export function threeStepMotion(
  moving: ConnectorFrame,
  wanted: Vector3,
  translation: Vector3,
  turnAxis: Vector3,
  angle: number,
): RigidTransform {
  const first = rotationAbout(moving.origin, minimalRotation(moving.direction, wanted));
  const movedOrigin = add(moving.origin, translation);
  return compose(
    turnAbout(movedOrigin, turnAxis, angle),
    compose(translationBy(translation), first),
  );
}
