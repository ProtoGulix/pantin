import { describe, expect, it } from "vitest";
import { normalize, rotate, type Vector3 } from "../rigid-transform.ts";
import { DIRECTION_EPSILON, minimalRotation, signedAngleAbout } from "./geometry.ts";

function expectVector(actual: Vector3, expected: Vector3): void {
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 12);
  });
}

describe("minimalRotation (ADR 0035 point 5)", () => {
  it("takes one direction to the other about their common perpendicular", () => {
    const from = normalize([1, 2, 3]);
    const to = normalize([-2, 0.5, 1]);
    expectVector(rotate(minimalRotation(from, to), from), to);
    // The common perpendicular does not move.
    const perpendicular = normalize([
      from[1] * to[2] - from[2] * to[1],
      from[2] * to[0] - from[0] * to[2],
      from[0] * to[1] - from[1] * to[0],
    ]);
    expectVector(rotate(minimalRotation(from, to), perpendicular), perpendicular);
  });

  it("is the identity for directions closer than epsilon", () => {
    const nearly: Vector3 = normalize([1, Math.sqrt(DIRECTION_EPSILON) / 10, 0]);
    expect(minimalRotation([1, 0, 0], nearly)).toEqual([0, 0, 0, 1]);
  });

  it("turns opposite directions half a turn about from × e, e the least aligned frame axis", () => {
    // Least aligned with (1, 0.5, 0) is Z: the half turn is about (1, 0.5, 0) × Z.
    const from = normalize([1, 0.5, 0]);
    const rotation = minimalRotation(from, [-from[0], -from[1], -from[2]]);
    expectVector(rotate(rotation, from), [-from[0], -from[1], -from[2]]);
    expectVector(rotate(rotation, [0, 0, 1]), [0, 0, -1]);
  });

  it("breaks a tie between frame axes in the order X, Y, Z", () => {
    // (0, 0, 1) is equally far from X and Y: X wins, the axis is Z × X = Y.
    const rotation = minimalRotation([0, 0, 1], [0, 0, -1]);
    expectVector(rotate(rotation, [0, 1, 0]), [0, 1, 0]);
    expectVector(rotate(rotation, [1, 0, 0]), [-1, 0, 0]);
  });
});

describe("signedAngleAbout", () => {
  it("is positive counterclockwise about the axis", () => {
    expect(signedAngleAbout([1, 0, 0], [0, 1, 0], [0, 0, 1])).toBeCloseTo(Math.PI / 2, 12);
    expect(signedAngleAbout([1, 0, 0], [0, 1, 0], [0, 0, -1])).toBeCloseTo(-Math.PI / 2, 12);
  });
});
