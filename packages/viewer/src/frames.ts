import type { LengthUnit, UpAxis } from "@pantin/protocol";
import type { MeshFileFormat } from "./mesh-format.ts";

// The ONLY module of the viewer that converts between coordinate frames
// (CLAUDE.md section 5). Everything else speaks either "core" or "Babylon" and
// calls into here at the boundary.
//
// Frames involved:
//   core     right-handed, Z up, metres. The frame of pantin.json and the API.
//   Babylon  left-handed, Y up (Babylon.js default scene).
//   file     right-handed (glTF by specification, STL by convention), either
//            Y up (glTF specification) or Z up (CAD exports, spike 0001), in
//            the body's source unit. STEP files never reach the viewer: the
//            core converts them into GLB files in metres, Z up (ADR 0009),
//            so they are read here as a GLB with upAxis "z" and unit "m".
//
// Matrices are 3x3, row-major, acting on column vectors: p' = M * p.

export type Vector3Tuple = readonly [number, number, number];
export type Matrix3 = readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple];
type Axis = 0 | 1 | 2;

export const LENGTH_UNIT_IN_METRES: Readonly<Record<LengthUnit, number>> = {
  m: 1,
  mm: 0.001,
  cm: 0.01,
  // Exact by definition of the international inch (1959).
  in: 0.0254,
};

const IDENTITY: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// Core -> Babylon: swap Y and Z. Why a swap and not a rotation: a swap is a
// reflection (determinant -1), which is exactly what turns a right-handed frame
// into a left-handed one while keeping every shape looking the same. Core X
// (east) stays Babylon X (right), core Z (up) becomes Babylon Y (up), core Y
// (north) becomes Babylon Z (away from the default camera).
const CORE_TO_BABYLON: Matrix3 = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];

// A Y-up file turned Z up by a +90 degree rotation about X: file up (+Y)
// becomes core up (+Z), file front (+Z, glTF convention) becomes core -Y.
// This is the convention Blender uses when importing glTF.
const Y_UP_FILE_TO_Z_UP: Matrix3 = [
  [1, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
];

// What Babylon's loaders already do to file coordinates in a left-handed scene.
// We do NOT undo these by editing the loaded nodes; we model them here and
// compensate with the parent node transform returned by bodyNodeTransform.
//
// glTF: the loader parents everything under a "__root__" node with rotation
// 180 degrees about Y and scaling (1, 1, -1) (glTFLoader._createRootNode,
// coordinateSystemMode AUTO, @babylonjs/loaders 9.28.0). Scaling first, then
// rotation: (x, y, z) -> (x, y, -z) -> (-x, y, z). A mirror of X.
export const GLTF_LOADER_ROOT_MAPPING: Matrix3 = [
  [-1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// STL: with STLFileLoader.DO_NOT_ALTER_FILE_COORDINATES left at its default
// (false), the loader writes vertex (x, y, z) as (x, z, y) directly in the
// vertex buffer (stlFileLoader.pure.js, _parseBinary and _parseASCII). We keep
// that default on purpose: changing it means mutating a global static.
export const STL_LOADER_MAPPING: Matrix3 = CORE_TO_BABYLON;

function loaderMapping(format: MeshFileFormat): Matrix3 {
  return format === "glb" ? GLTF_LOADER_ROOT_MAPPING : STL_LOADER_MAPPING;
}

export function multiplyMatrix3(left: Matrix3, right: Matrix3): Matrix3 {
  const cell = (row: Axis, column: Axis): number =>
    left[row][0] * right[0][column] +
    left[row][1] * right[1][column] +
    left[row][2] * right[2][column];
  return [
    [cell(0, 0), cell(0, 1), cell(0, 2)],
    [cell(1, 0), cell(1, 1), cell(1, 2)],
    [cell(2, 0), cell(2, 1), cell(2, 2)],
  ];
}

export function applyMatrix3(matrix: Matrix3, point: Vector3Tuple): Vector3Tuple {
  const row = (index: Axis): number =>
    matrix[index][0] * point[0] + matrix[index][1] * point[1] + matrix[index][2] * point[2];
  return [row(0), row(1), row(2)];
}

function transposeMatrix3(matrix: Matrix3): Matrix3 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
}

function scaleMatrix3(matrix: Matrix3, factor: number): Matrix3 {
  const scaleRow = (row: Vector3Tuple): Vector3Tuple => [
    row[0] * factor,
    row[1] * factor,
    row[2] * factor,
  ];
  return [scaleRow(matrix[0]), scaleRow(matrix[1]), scaleRow(matrix[2])];
}

export function coreToBabylonPosition(point: Vector3Tuple): Vector3Tuple {
  return applyMatrix3(CORE_TO_BABYLON, point);
}

export function babylonToCorePosition(point: Vector3Tuple): Vector3Tuple {
  // The swap is its own inverse.
  return applyMatrix3(CORE_TO_BABYLON, point);
}

/** Linear map from raw file coordinates (source unit) to the core frame (metres). */
export function fileToCoreMatrix(upAxis: UpAxis, unit: LengthUnit): Matrix3 {
  const rotation = upAxis === "y" ? Y_UP_FILE_TO_Z_UP : IDENTITY;
  return scaleMatrix3(rotation, LENGTH_UNIT_IN_METRES[unit]);
}

/**
 * Linear transform to give the Babylon node that parents a loaded body.
 *
 * Wanted, from raw file coordinates to Babylon: CORE_TO_BABYLON * fileToCore.
 * The loader already applied its own mapping L, so the parent must apply
 * wanted * inverse(L). Both loader mappings are orthogonal, so the inverse is
 * the transpose. Why this matters: every result is a proper rotation times a
 * positive uniform scale (determinant > 0, see frames.test.ts), so Babylon's
 * back-face culling, already right for the loader's output, stays right.
 */
export function bodyNodeTransform(
  format: MeshFileFormat,
  upAxis: UpAxis,
  unit: LengthUnit,
): Matrix3 {
  const wanted = multiplyMatrix3(CORE_TO_BABYLON, fileToCoreMatrix(upAxis, unit));
  return multiplyMatrix3(wanted, transposeMatrix3(loaderMapping(format)));
}

/**
 * The 16 numbers Babylon's Matrix.FromArray expects for this linear map.
 * Babylon multiplies row vectors (p' = p * M), so its matrix is the transpose
 * of ours; laid out row by row, that is our matrix read column by column.
 */
export function toBabylonMatrixArray(matrix: Matrix3): number[] {
  const column = (index: Axis): number[] => [
    matrix[0][index],
    matrix[1][index],
    matrix[2][index],
    0,
  ];
  return [...column(0), ...column(1), ...column(2), 0, 0, 0, 1];
}
