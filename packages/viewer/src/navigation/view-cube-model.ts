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

// A fixed light up, left and in front of the screen. The shade of a face
// comes from its normal in the camera frame, so the faces keep their relative
// brightness as the cube turns and the volume reads as a solid.
const LIGHT_ON_SCREEN: Vector3Tuple = normalised([-0.35, 0.55, 0.75]);
const DARKEST_LIGHTNESS = 70;
const LIGHTNESS_RANGE = 22;

/** Lightness in percent (0 to 100) of a face with this outward normal, for a light grey cube. */
export function faceLightness(basis: CoreBasis, normal: Vector3Tuple): number {
  const onScreen = toCss(basis, normal);
  // CSS y points down, the light is given with y up.
  const lambert = Math.max(
    0,
    onScreen[0] * LIGHT_ON_SCREEN[0] -
      onScreen[1] * LIGHT_ON_SCREEN[1] +
      onScreen[2] * LIGHT_ON_SCREEN[2],
  );
  return DARKEST_LIGHTNESS + LIGHTNESS_RANGE * lambert;
}

export type TriadAxis = "x" | "y" | "z";

export interface TriadSegment {
  axis: TriadAxis;
  // Pixels from the cube's centre, x right and y down on screen.
  from: { x: number; y: number };
  to: { x: number; y: number };
  // False for an axis seen end on, whose projection is float noise: its
  // letter would land in an arbitrary direction next to the cube.
  visible: boolean;
}

// Below this share of its length on screen, an axis counts as seen end on.
const END_ON_SHARE = 0.25;

// As in Fusion 360, the axes start at the front bottom left corner (-X, -Y,
// -Z), run along the cube's edges and reach past it. The triad is drawn
// under the opaque faces, so the part of an axis behind the cube is hidden
// and its tip shows where it leaves the cube. (The corner farthest from the
// isometric view projects onto the nearest one and put the axes over the
// faces.)
const TRIAD_ORIGIN: Vector3Tuple = [-1, -1, -1];
const TRIAD_AXES: readonly { axis: TriadAxis; direction: Vector3Tuple }[] = [
  { axis: "x", direction: [1, 0, 0] },
  { axis: "y", direction: [0, 1, 0] },
  { axis: "z", direction: [0, 0, 1] },
];

// Where CSS `perspective` puts a point (z towards the viewer) on screen, the
// perspective origin being the cube's centre. The faces get it from the
// browser; the flat triad must get the same, or it drifts off their edges.
function inPerspective([x, y, z]: Vector3Tuple, perspective: number): Vector3Tuple {
  const factor = Number.isFinite(perspective) ? perspective / (perspective - z) : 1;
  return [x * factor, y * factor, z];
}

/**
 * The triad drawn flat under the cube: where each axis goes on screen, with
 * the cube's CSS perspective in pixels (Infinity for none).
 */
export function triadSegments(
  basis: CoreBasis,
  halfSize: number,
  length: number,
  perspective = Number.POSITIVE_INFINITY,
): TriadSegment[] {
  const start = scaled(TRIAD_ORIGIN, halfSize);
  const origin = inPerspective(toCss(basis, start), perspective);
  return TRIAD_AXES.map(({ axis, direction }) => {
    const tip = inPerspective(toCss(basis, add(start, scaled(direction, length))), perspective);
    const projected = Math.hypot(tip[0] - origin[0], tip[1] - origin[1]);
    return {
      axis,
      from: { x: origin[0], y: origin[1] },
      to: { x: tip[0], y: tip[1] },
      visible: projected >= END_ON_SHARE * length,
    };
  });
}
