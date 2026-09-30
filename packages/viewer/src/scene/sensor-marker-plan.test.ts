import { describe, expect, it } from "vitest";
import { babylonToCorePosition, coreToBabylonPosition } from "../frames.ts";
import { placeJointArrow } from "./scene-plan.ts";
import { arcAboutAxis, placeAlongAxis } from "./sensor-marker-plan.ts";

// Where the sensor markers stand (ADR 0024), answered in the Babylon frame.

function expectClose(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  for (const [index, value] of actual.entries()) {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 9);
  }
}

describe("placeAlongAxis", () => {
  it("starts at the range's first coordinate along the axis, turned like the joint arrow", () => {
    const placement = placeAlongAxis([0.01, 0, 0], [2, 0, 0], 0.098, 0.1);
    expectClose(placement.start, coreToBabylonPosition([0.108, 0, 0]));
    expect(placement.length).toBeCloseTo(0.002, 12);
    expectClose(placement.rotation, placeJointArrow([0, 0, 0], [1, 0, 0], 1).rotation);
  });
});

describe("arcAboutAxis", () => {
  // Back in the core frame, where the joint's axis and angles are defined.
  const arcInCore = (from: number, to: number, steps: number) =>
    arcAboutAxis([0, 0, 0.5], [0, 0, 3], { from, to }, 0.2, steps).map(babylonToCorePosition);

  it("keeps every point at the radius around the origin, square to the axis", () => {
    for (const [x, y, z] of arcInCore(0, Math.PI, 24)) {
      expect(Math.hypot(x, y)).toBeCloseTo(0.2, 9);
      expect(z).toBeCloseTo(0.5, 9);
    }
  });

  it("turns by the right-hand rule about an oblique axis too", () => {
    const axis = [1, 2, 2] as const;
    const [first, , last] = arcAboutAxis(
      [0, 0, 0],
      [...axis],
      { from: 0, to: Math.PI / 2 },
      1,
      2,
    ).map(babylonToCorePosition);
    const [ax, ay, az] = [first?.[0] ?? 0, first?.[1] ?? 0, first?.[2] ?? 0];
    const [bx, by, bz] = [last?.[0] ?? 0, last?.[1] ?? 0, last?.[2] ?? 0];
    const cross = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    // first × last points along the axis (unit length 3), not against it.
    expect(cross.map((value) => value * 3)).toEqual(axis.map((value) => expect.closeTo(value, 9)));
  });

  it("turns by the right-hand rule about the axis, as the core does", () => {
    const [first, , last] = arcInCore(0, Math.PI / 2, 2);
    // A quarter turn counterclockwise seen from +Z: the cross product points up.
    const crossZ = (first?.[0] ?? 0) * (last?.[1] ?? 0) - (first?.[1] ?? 0) * (last?.[0] ?? 0);
    expect(crossZ).toBeCloseTo(0.04, 9);
  });
});
