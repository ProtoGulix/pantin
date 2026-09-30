import { coreToBabylonPosition, type Vector3Tuple } from "../frames.ts";
import { type ArrowPlacement, rotationFromUpTo } from "./scene-plan.ts";

// Where the sensor markers stand (ADR 0024), as pure functions of the joint's
// origin and axis in the core frame, answered in the Babylon frame. Kept apart
// from Babylon so that they run under Node in unit tests.

type Vector = readonly [number, number, number];

const add = (a: Vector, b: Vector): Vector3Tuple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vector, factor: number): Vector3Tuple => [
  a[0] * factor,
  a[1] * factor,
  a[2] * factor,
];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector3Tuple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vector): Vector3Tuple => scale(a, 1 / Math.hypot(...a));

/**
 * The stretch of a joint's axis between two coordinates (metres from its
 * origin, the axis need not be unit): where it starts, how it turns, how long.
 */
export function placeAlongAxis(
  origin: Vector3Tuple,
  axis: Vector3Tuple,
  from: number,
  to: number,
): ArrowPlacement {
  const direction = unit(axis);
  return {
    start: coreToBabylonPosition(add(origin, scale(direction, from))),
    rotation: rotationFromUpTo(unit(coreToBabylonPosition(direction))),
    length: to - from,
  };
}

// A unit vector square to the axis: the world axis least along it, minus its
// share along the axis. Any one would do: angle zero has no meaning of its own.
function squareTo(direction: Vector3Tuple): Vector3Tuple {
  const worldAxes: Vector3Tuple[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const least = worldAxes.reduce((best, candidate) =>
    Math.abs(dot(candidate, direction)) < Math.abs(dot(best, direction)) ? candidate : best,
  );
  return unit(add(least, scale(direction, -dot(least, direction))));
}

/**
 * Points of the arc about a joint's axis from one angle to the other
 * (radians, positive by the right-hand rule, as in the core), at this radius
 * around its origin, in the Babylon frame.
 */
export function arcAboutAxis(
  origin: Vector3Tuple,
  axis: Vector3Tuple,
  angles: { from: number; to: number },
  radius: number,
  steps = 24,
): Vector3Tuple[] {
  const direction = unit(axis);
  const u = squareTo(direction);
  const v = cross(direction, u);
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = angles.from + ((angles.to - angles.from) * index) / steps;
    const offset = add(scale(u, radius * Math.cos(angle)), scale(v, radius * Math.sin(angle)));
    return coreToBabylonPosition(add(origin, offset));
  });
}
