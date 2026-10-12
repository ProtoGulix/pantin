import { type Quaternion, rotate, type Vector3 } from "./rigid-transform.ts";

// Overlap of two oriented boxes by the separating axis test: exact (15 axes),
// pure and deterministic, with no world query. Used by the spawn planning, where
// a box that would overlap a product is not spawned (ADR 0043 point 5).
//
// Touching boxes do not overlap: a separation along an axis counts when the
// penetration on it is at most PENETRATION_TOLERANCE. A product resting on the
// belt a hair into the emitter's box, or two boxes face to face, are not blocked.
// The nine edge-edge axes are normalised first, so the tolerance is the same
// length on every axis; an axis of two nearly parallel edges is skipped (the
// face axes decide there).
const PENETRATION_TOLERANCE = 1e-6;

// Below this length the cross product of two edge directions is rounding noise.
const MIN_EDGE_AXIS_LENGTH = 1e-7;

export type OrientedBox = {
  centre: Vector3;
  rotation: Quaternion;
  // Full size along the box's own X, Y and Z.
  size: Vector3;
};

type Frame = { axes: readonly [Vector3, Vector3, Vector3]; half: Vector3 };

function frameOf(box: OrientedBox): Frame {
  return {
    axes: [
      rotate(box.rotation, [1, 0, 0]),
      rotate(box.rotation, [0, 1, 0]),
      rotate(box.rotation, [0, 0, 1]),
    ],
    half: [box.size[0] / 2, box.size[1] / 2, box.size[2] / 2],
  };
}

const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

type Relation = {
  // rotation[i][j] = dot(a.axes[i], b.axes[j]).
  rotation: number[][];
  absolute: number[][];
  // The centre offset in the axes of a.
  offset: Vector3;
};

function relationOf(a: Frame, b: Frame, offsetWorld: Vector3): Relation {
  const rotation = a.axes.map((axisA) => b.axes.map((axisB) => dot(axisA, axisB)));
  return {
    rotation,
    absolute: rotation.map((row) => row.map((value) => Math.abs(value))),
    offset: [dot(offsetWorld, a.axes[0]), dot(offsetWorld, a.axes[1]), dot(offsetWorld, a.axes[2])],
  };
}

// A radii sum within the tolerance (a box with no size on that axis) can only
// separate by a clear gap, never by touching.
function isSeparated(distance: number, radiusA: number, radiusB: number): boolean {
  const reach = radiusA + radiusB;
  const gap = Math.abs(distance);
  return gap > reach || (reach > PENETRATION_TOLERANCE && gap >= reach - PENETRATION_TOLERANCE);
}

function faceAxesSeparate(a: Frame, b: Frame, relation: Relation): boolean {
  const { absolute, offset, rotation } = relation;
  for (let i = 0; i < 3; i += 1) {
    const radiusB = b.half.reduce((sum, half, j) => sum + half * (absolute[i]?.[j] ?? 0), 0);
    if (isSeparated(offset[i] ?? 0, a.half[i] ?? 0, radiusB)) {
      return true;
    }
  }
  for (let j = 0; j < 3; j += 1) {
    const radiusA = a.half.reduce((sum, half, i) => sum + half * (absolute[i]?.[j] ?? 0), 0);
    const distance = offset.reduce((sum, along, i) => sum + along * (rotation[i]?.[j] ?? 0), 0);
    if (isSeparated(distance, radiusA, b.half[j] ?? 0)) {
      return true;
    }
  }
  return false;
}

// The axis a.axes[i] × b.axes[j], in the axes of a, for i and j in 0..2.
function edgeAxesSeparate(a: Frame, b: Frame, relation: Relation): boolean {
  const { absolute, offset, rotation } = relation;
  const at = (matrix: number[][], row: number, column: number): number =>
    matrix[row % 3]?.[column % 3] ?? 0;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const [i1, i2, j1, j2] = [i + 1, i + 2, j + 1, j + 2];
      const radiusA =
        (a.half[i1 % 3] ?? 0) * at(absolute, i2, j) + (a.half[i2 % 3] ?? 0) * at(absolute, i1, j);
      const radiusB =
        (b.half[j1 % 3] ?? 0) * at(absolute, i, j2) + (b.half[j2 % 3] ?? 0) * at(absolute, i, j1);
      const distance =
        (offset[i2 % 3] ?? 0) * at(rotation, i1, j) - (offset[i1 % 3] ?? 0) * at(rotation, i2, j);
      const length = Math.hypot(...cross(a.axes[i] ?? [0, 0, 0], b.axes[j] ?? [0, 0, 0]));
      if (length < MIN_EDGE_AXIS_LENGTH) {
        continue;
      }
      if (isSeparated(distance / length, radiusA / length, radiusB / length)) {
        return true;
      }
    }
  }
  return false;
}

export function boxesOverlap(first: OrientedBox, second: OrientedBox): boolean {
  const a = frameOf(first);
  const b = frameOf(second);
  const offsetWorld: Vector3 = [
    second.centre[0] - first.centre[0],
    second.centre[1] - first.centre[1],
    second.centre[2] - first.centre[2],
  ];
  const relation = relationOf(a, b, offsetWorld);
  return !faceAxesSeparate(a, b, relation) && !edgeAxesSeparate(a, b, relation);
}
