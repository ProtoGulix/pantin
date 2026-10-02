import { multiplyQuaternions, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import { conjugate, normalizedRotation } from "../rigid-transform.ts";

// Steps of the gizmo (ADR 0034 point 5). The viewer snaps the DRAG, not the
// resulting value: the distance dragged along an anchor axis, or the angle
// turned about one, is rounded to the step and the delta is rebuilt exactly.
// Float noise of the gizmo (a stray 1e-7 on another axis) never reaches the
// document, and a value typed off-grid survives a drag on another axis, which
// rounding the six final fields would have snapped.

export interface SnapSteps {
  translationMillimetres: number;
  rotationDegrees: number;
}

export const DEFAULT_SNAP_STEPS: SnapSteps = { translationMillimetres: 1, rotationDegrees: 15 };

export type DragKind = "move" | "rotate";

// "+ 0" turns -0 into 0, which would otherwise be sent as -0 and shown as such.
function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step + 0;
}

function dominantAxis(components: readonly number[]): 0 | 1 | 2 {
  const [x = 0, y = 0, z = 0] = components.map(Math.abs);
  if (x >= y && x >= z) {
    return 0;
  }
  return y >= z ? 1 : 2;
}

/**
 * The displacement (metres, anchor frame) of a drag along an arrow: only the
 * axis it moved along is kept, the others are exactly 0. `stepMillimetres`
 * null (Ctrl held): that axis is kept as dragged.
 */
export function snapTranslationDelta(
  delta: Vector3Tuple,
  stepMillimetres: number | null,
): Vector3Tuple {
  const axis = dominantAxis(delta);
  const along = delta[axis];
  const snapped =
    stepMillimetres === null ? along : roundToStep(along * 1000, stepMillimetres) / 1000;
  return [axis === 0 ? snapped : 0, axis === 1 ? snapped : 0, axis === 2 ? snapped : 0];
}

/**
 * The rotation of a drag about a ring, in the anchor frame, as a unit
 * quaternion about one anchor axis: its angle is rounded to the step (null:
 * kept as dragged) and the quaternion rebuilt, so the other components are 0.
 */
export function snapRotationDelta(
  delta: QuaternionTuple,
  stepDegrees: number | null,
): QuaternionTuple {
  // q and -q are the same rotation: take the one with w >= 0, angle in [-180, 180].
  const [x, y, z, w] = delta[3] < 0 ? delta.map((part) => -part) : delta;
  const vector = [x ?? 0, y ?? 0, z ?? 0];
  const axis = dominantAxis(vector);
  const angle = 2 * Math.atan2(vector[axis] ?? 0, w ?? 1);
  const snapped =
    stepDegrees === null
      ? angle
      : roundToStep((angle * 180) / Math.PI, stepDegrees) * (Math.PI / 180);
  const sine = Math.sin(snapped / 2);
  return [
    axis === 0 ? sine : 0,
    axis === 1 ? sine : 0,
    axis === 2 ? sine : 0,
    Math.cos(snapped / 2),
  ];
}

/** The rotation that, applied after `start`, gives `turned`: turned . start^-1. */
export function rotationBetween(start: QuaternionTuple, turned: QuaternionTuple): QuaternionTuple {
  return normalizedRotation(multiplyQuaternions(turned, conjugate(start)));
}
