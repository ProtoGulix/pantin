import { expect } from "vitest";
import type { Vector3 } from "../domain/rigid-transform.ts";

// Coordinates equal to 12 decimals: poses come out of trigonometry.
export function expectPoint(actual: Vector3, expected: Vector3): void {
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 12);
  });
}
