// Turntable arithmetic of the 3D view (ADR 0036 points 3 and 7). The camera is
// Babylon.js's ArcRotateCamera, Y up in its own frame (Z up in the core: the
// conversion is in frames.ts, so nothing here knows about Z). Position =
// target + radius * back, with back = (cos a sin b, cos b, sin a sin b).

export type Vector = readonly [number, number, number];

export interface ViewBasis {
  right: Vector;
  up: Vector;
  // From the target towards the camera.
  back: Vector;
}

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Screen axes of the camera at these angles, in the left-handed frame of
 * Babylon.js (checked: alpha -90 deg, beta 90 deg sits on -Z, looks along +Z,
 * +X on the right).
 */
export function viewBasis(alpha: number, beta: number): ViewBasis {
  const back: Vector = [
    Math.cos(alpha) * Math.sin(beta),
    Math.cos(beta),
    Math.sin(alpha) * Math.sin(beta),
  ];
  const right: Vector = [-Math.sin(alpha), 0, Math.cos(alpha)];
  const forward: Vector = [-back[0], -back[1], -back[2]];
  return { right, up: cross(forward, right), back };
}

/** Components of a world vector along the screen axes (right, up, back). */
export function toScreenAxes(vector: Vector, basis: ViewBasis): Vector {
  const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dot(vector, basis.right), dot(vector, basis.up), dot(vector, basis.back)];
}

export function fromScreenAxes(components: Vector, basis: ViewBasis): Vector {
  const { right, up, back } = basis;
  const [x, y, z] = components;
  return [
    x * right[0] + y * up[0] + z * back[0],
    x * right[1] + y * up[1] + z * back[1],
    x * right[2] + y * up[2] + z * back[2],
  ];
}

/**
 * The target that keeps the pivot where it is on screen after the camera
 * turned (basis is the new one): the pivot's offset from the target is the
 * same in screen axes before and after, so the camera turns about the pivot,
 * not about the old target, and the view never jumps when the centre of
 * rotation changes. Same radius, same direction.
 */
export function targetKeepingPivot(
  pivot: Vector,
  pivotFromTargetOnScreen: Vector,
  basis: ViewBasis,
): Vector {
  const offset = fromScreenAxes(pivotFromTargetOnScreen, basis);
  return [pivot[0] - offset[0], pivot[1] - offset[1], pivot[2] - offset[2]];
}

const ARROW_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;
export type ArrowKey = (typeof ARROW_KEYS)[number];

export function isArrowKey(key: string): key is ArrowKey {
  return (ARROW_KEYS as readonly string[]).includes(key);
}

const QUARTER_TURN_DEGREES = 90;
// Share of the visible height that one Ctrl + arrow pans.
const PAN_SHARE_OF_HEIGHT = 0.1;

export interface AngleStep {
  alpha: number;
  beta: number;
}

/**
 * An arrow turns the model like a drag in that direction: right lowers alpha,
 * down lowers beta (the camera goes up). Shift takes a quarter turn.
 */
export function arrowRotation(key: ArrowKey, shift: boolean, stepDegrees: number): AngleStep {
  const radians = ((shift ? QUARTER_TURN_DEGREES : stepDegrees) * Math.PI) / 180;
  switch (key) {
    case "ArrowLeft":
      return { alpha: radians, beta: 0 };
    case "ArrowRight":
      return { alpha: -radians, beta: 0 };
    case "ArrowUp":
      return { alpha: 0, beta: radians };
    case "ArrowDown":
      return { alpha: 0, beta: -radians };
  }
}

/** Ctrl + arrow: the model follows the arrow, so the target goes the other way. */
export function arrowPan(key: ArrowKey, visibleHalfHeight: number): { right: number; up: number } {
  const amount = 2 * visibleHalfHeight * PAN_SHARE_OF_HEIGHT;
  switch (key) {
    case "ArrowLeft":
      return { right: amount, up: 0 };
    case "ArrowRight":
      return { right: -amount, up: 0 };
    case "ArrowUp":
      return { right: 0, up: -amount };
    case "ArrowDown":
      return { right: 0, up: amount };
  }
}
