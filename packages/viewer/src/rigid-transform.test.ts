import { describe, expect, it } from "vitest";
import {
  composeTransforms,
  IDENTITY_TRANSFORM,
  invertTransform,
  normalizedRotation,
  type RigidTransform,
  rotateVector,
} from "./rigid-transform.ts";

const QUARTER_TURN_Z: [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 12);
  });
}

describe("rigid transforms", () => {
  it("turns a vector by a quarter turn about Z", () => {
    expectClose(rotateVector(QUARTER_TURN_Z, [1, 0, 0]), [0, 1, 0]);
  });

  it("applies the inner transform first", () => {
    const turn: RigidTransform = { translation: [0, 0, 0], rotation: QUARTER_TURN_Z };
    const shift: RigidTransform = { translation: [1, 0, 0], rotation: [0, 0, 0, 1] };
    // Shift then turn: (1, 0, 0) ends at (0, 1, 0).
    expectClose(composeTransforms(turn, shift).translation, [0, 1, 0]);
    // Turn then shift: the origin ends at (1, 0, 0).
    expectClose(composeTransforms(shift, turn).translation, [1, 0, 0]);
  });

  it("composes with its inverse into the identity", () => {
    const transform: RigidTransform = { translation: [0.3, -0.2, 0.5], rotation: QUARTER_TURN_Z };
    const identity = composeTransforms(transform, invertTransform(transform));
    expectClose(identity.translation, IDENTITY_TRANSFORM.translation);
    expectClose(identity.rotation, IDENTITY_TRANSFORM.rotation);
  });

  it("normalises a rotation without changing its direction", () => {
    expectClose(
      normalizedRotation([0, 0, 2, 2]),
      QUARTER_TURN_Z.map(() => Math.SQRT1_2).map((v, i) => (i < 2 ? 0 : v)),
    );
  });
});
