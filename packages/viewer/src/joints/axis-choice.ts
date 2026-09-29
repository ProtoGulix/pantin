import type { Vector3 } from "@pantin/protocol";

// A joint axis as the user chooses it: one of the parent body's X, Y or Z
// directions, and a sense. At the reference configuration every body sits
// where it was imported, so the parent body's frame is the Pantin frame
// (ADR 0011): the stored vector needs no conversion. Any other vector is a
// custom direction, typed component by component.

export const AXIS_DIRECTIONS = ["x", "y", "z"] as const;
export type AxisDirection = (typeof AXIS_DIRECTIONS)[number];

export interface AxisChoice {
  direction: AxisDirection | "custom";
  // True when the positive coordinate runs towards -X, -Y or -Z. For a custom
  // vector, when its first non-zero component is negative.
  reversed: boolean;
}

export function axisChoiceOf(axis: readonly number[]): AxisChoice {
  const nonZero = axis.flatMap((component, index) => (component === 0 ? [] : [index]));
  const firstIndex = nonZero[0];
  const first = firstIndex === undefined ? 0 : (axis[firstIndex] ?? 0);
  const direction =
    nonZero.length === 1 && firstIndex !== undefined ? AXIS_DIRECTIONS[firstIndex] : undefined;
  return { direction: direction ?? "custom", reversed: first < 0 };
}

export function axisVectorOf(direction: AxisDirection, reversed: boolean): Vector3 {
  const sign = reversed ? -1 : 1;
  return [direction === "x" ? sign : 0, direction === "y" ? sign : 0, direction === "z" ? sign : 0];
}

/** The same line, run the other way. */
export function reversedAxis(axis: Vector3): Vector3 {
  // 0 - x rather than -x, so that no -0 reaches the form or the saved file.
  return [0 - axis[0], 0 - axis[1], 0 - axis[2]];
}

/** A raw select or radio value as a direction, or null: UI values are external input. */
export function parseAxisDirection(raw: string): AxisDirection | null {
  return AXIS_DIRECTIONS.find((direction) => direction === raw) ?? null;
}
