import { babylonToCorePosition, type Vector3Tuple } from "../frames.ts";
import { STANDARD_VIEW_IDS, STANDARD_VIEWS, type StandardViewId } from "./standard-views.ts";
import { type Vector, viewBasis } from "./turntable.ts";

// The view cube of ADR 0036 point 5, as arithmetic: what each clickable cell
// of the cube means and where CSS has to put it. The DOM is in ui/view-cube.ts.
//
// Each face is a 3 x 3 grid. The centre cell is the face (a standard view),
// the four cells at its sides are edges and the four at its corners are
// corners: the cell looks at the cube from the direction it sits in.

export interface CubeCell {
  face: StandardViewId;
  // Position in the face grid along the face's screen right and down, -1 to 1.
  column: number;
  row: number;
  // Unit vector from the target towards the camera that this cell asks for.
  direction: Vector3Tuple;
  kind: "face" | "edge" | "corner";
}

function normalised(vector: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function add(...vectors: Vector3Tuple[]): Vector3Tuple {
  return [
    vectors.reduce((sum, vector) => sum + vector[0], 0),
    vectors.reduce((sum, vector) => sum + vector[1], 0),
    vectors.reduce((sum, vector) => sum + vector[2], 0),
  ];
}

function scaled(vector: Vector3Tuple, factor: number): Vector3Tuple {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

const FACE_IDS = STANDARD_VIEW_IDS.filter((id) => id !== "isometric");
const STEPS = [-1, 0, 1] as const;

/** The screen axes of a face seen from outside: right, and down (the CSS y axis). */
function faceAxes(face: StandardViewId): { right: Vector3Tuple; down: Vector3Tuple } {
  const { right, up } = STANDARD_VIEWS[face];
  if (right === null || up === null) {
    throw new Error(`The ${face} view has no face on the cube.`);
  }
  return { right, down: scaled(up, -1) };
}

export function cubeCells(): CubeCell[] {
  return FACE_IDS.flatMap((face) => {
    const { right, down } = faceAxes(face);
    return STEPS.flatMap((row) =>
      STEPS.map((column): CubeCell => {
        const sides = Math.abs(column) + Math.abs(row);
        return {
          face,
          column,
          row,
          direction: normalised(
            add(STANDARD_VIEWS[face].camera, scaled(right, column), scaled(down, row)),
          ),
          kind: sides === 0 ? "face" : sides === 1 ? "edge" : "corner",
        };
      }),
    );
  });
}

/** Cells that ask for the same view share a key, so that hovering one lights all. */
export function directionKey(direction: Vector3Tuple): string {
  return direction.map((component) => component.toFixed(3)).join(",");
}

/** The camera's screen axes in the core frame; the cube turns by them. */
export interface CoreBasis {
  right: Vector3Tuple;
  up: Vector3Tuple;
  back: Vector3Tuple;
}

export function coreBasisOf(alpha: number, beta: number): CoreBasis {
  const basis = viewBasis(alpha, beta);
  const toCore = (vector: Vector) => babylonToCorePosition(vector);
  return { right: toCore(basis.right), up: toCore(basis.up), back: toCore(basis.back) };
}

function dot(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// A core vector as CSS sees it: x to the right, y down, z towards the viewer.
function toCss(basis: CoreBasis, vector: Vector3Tuple): Vector3Tuple {
  return [dot(basis.right, vector), -dot(basis.up, vector), dot(basis.back, vector)];
}

/**
 * The CSS matrix3d of a cell, for an element centred in the cube. Its own x
 * and y run along the face's right and down, its z out of the face; `step` is
 * the cell's size in pixels, so the face is 3 steps wide.
 */
export function cellTransform(cell: CubeCell, basis: CoreBasis, step: number): string {
  const { right, down } = faceAxes(cell.face);
  const normal = STANDARD_VIEWS[cell.face].camera;
  const centre = add(
    scaled(normal, 1.5 * step),
    scaled(right, cell.column * step),
    scaled(down, cell.row * step),
  );
  const columns = [right, down, normal, centre].map((vector) => toCss(basis, vector));
  const [first, second, third, origin] = columns as [
    Vector3Tuple,
    Vector3Tuple,
    Vector3Tuple,
    Vector3Tuple,
  ];
  const numbers = [...first, 0, ...second, 0, ...third, 0, ...origin, 1];
  return `matrix3d(${numbers.map((value) => Number(value.toFixed(5))).join(",")})`;
}
