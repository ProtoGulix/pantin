import type { Placement } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import type { QuaternionTuple } from "./frames.ts";
import { fieldsToPlacement, type PlacementFields, placementToFields } from "./placement-units.ts";

const ZERO: PlacementFields = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

// q and -q are the same rotation.
function expectSameRotation(actual: QuaternionTuple, expected: QuaternionTuple): void {
  const dot = actual.reduce((sum, value, index) => sum + value * (expected[index] ?? 0), 0);
  expect(Math.abs(dot)).toBeCloseTo(1, 12);
}

describe("placement fields", () => {
  it("converts millimetres to metres and back, identity for no rotation", () => {
    const placement = fieldsToPlacement({ ...ZERO, x: 250, y: -10, z: 0.5 });
    expect(placement.translation).toEqual([0.25, -0.01, 0.0005]);
    expect(placement.rotation).toEqual([0, 0, 0, 1]);
    const back = placementToFields(placement);
    expect(back.x).toBeCloseTo(250, 9);
    expect(back.y).toBeCloseTo(-10, 9);
    expect(back.z).toBeCloseTo(0.5, 9);
    expect(Math.abs(back.rx) + Math.abs(back.ry) + Math.abs(back.rz)).toBe(0);
  });

  it("turns about the fixed X, then Y, then Z axes", () => {
    // 90 degrees about X sends +Y to +Z; then 90 about Z sends +Z to +Z and
    // the image of +X (untouched by the first turn) to +Y.
    const [x, y, z, w] = fieldsToPlacement({ ...ZERO, rx: 90, rz: 90 }).rotation;
    // R = Rz(90) Rx(90): the image of +Y is Rz(90) (+Z) = +Z, of +X is +Y.
    // Check through the matrix column of +X: R00 = 1 - 2(y^2 + z^2), R10 = 2(xy + wz).
    expect(1 - 2 * (y * y + z * z)).toBeCloseTo(0, 12);
    expect(2 * (x * y + w * z)).toBeCloseTo(1, 12);
  });

  it("round-trips ordinary angles to what was typed", () => {
    const typed = { x: 1, y: 2, z: 3, rx: 30, ry: -40, rz: 125 };
    const back = placementToFields(fieldsToPlacement(typed));
    for (const field of Object.keys(typed) as (keyof PlacementFields)[]) {
      expect(back[field]).toBeCloseTo(typed[field], 9);
    }
  });

  it("recovers the same rotation at the poles of RY, where RX and RZ are not unique", () => {
    for (const ry of [90, -90, 89.9999, -89.9999]) {
      for (const [rx, rz] of [
        [0, 0],
        [30, 0],
        [30, 50],
        [-120, 70],
      ] as const) {
        const original = fieldsToPlacement({ ...ZERO, rx, ry, rz });
        const again = fieldsToPlacement(placementToFields(original));
        expectSameRotation(again.rotation, original.rotation);
      }
    }
  });

  it("puts the whole twist in RX at a pole, with RZ at 0", () => {
    const atPole = placementToFields(fieldsToPlacement({ ...ZERO, rx: 30, ry: 90, rz: 10 }));
    expect(atPole.ry).toBeCloseTo(90, 9);
    expect(atPole.rz).toBe(0);
    expect(atPole.rx).toBeCloseTo(20, 9);
  });

  it("accepts a stored quaternion a hair off unit length", () => {
    const stored: Placement = {
      translation: [0, 0, 0],
      rotation: [0, 0, Math.SQRT1_2 * (1 + 5e-7), Math.SQRT1_2 * (1 + 5e-7)],
    };
    expect(placementToFields(stored).rz).toBeCloseTo(90, 9);
  });
});
