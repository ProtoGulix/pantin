import { expect } from "vitest";
import { type Quaternion, rotate, type Vector3 } from "../domain/rigid-transform.ts";

// Coordinates equal to 12 decimals: poses come out of trigonometry.
export function expectPoint(actual: Vector3, expected: Vector3): void {
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 12);
  });
}

// Two unit quaternions are the same rotation when they turn the three unit
// vectors alike (q and -q included); bounds the error to 12 decimals, which a
// quaternion dot product near 1 cannot.
export function expectSameRotation(actual: Quaternion, expected: Quaternion): void {
  for (const unit of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const) {
    expectPoint(rotate(actual, unit), rotate(expected, unit));
  }
}
