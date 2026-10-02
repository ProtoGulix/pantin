import { describe, expect, it } from "vitest";
import { apply, compose, normalize, rotate, type Vector3 } from "../rigid-transform.ts";
import { AXIS_AROUND_PIVOT_MOTION } from "./axis-around-pivot.ts";
import { AXIS_ON_AXIS_MOTION } from "./axis-on-axis.ts";
import { type ConnectorFrame, turnAbout } from "./geometry.ts";
import type { AlignmentParameters } from "./motion.ts";
import { PLANE_ON_PLANE_MOTION } from "./plane-on-plane.ts";

const NONE: AlignmentParameters = { flip: false, offset: 0, rotation: 0 };

function frame(origin: Vector3, direction: Vector3): ConnectorFrame {
  return { origin, direction: normalize(direction) };
}

function expectVector(actual: Vector3, expected: Vector3): void {
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 9);
  });
}

// A moving plane tilted and away from the target plane z = 0.05 (normal +Z).
const tiltedPlane = frame([0.2, -0.1, 0.4], [0.3, 0.2, 0.9]);
const targetPlane = frame([0, 0, 0.05], [0, 0, 1]);

describe("plane on plane", () => {
  it("faces the target normal and sits on the target plane, origin kept in the plane", () => {
    const motion = PLANE_ON_PLANE_MOTION([tiltedPlane, targetPlane], NONE);
    expectVector(rotate(motion.rotation, tiltedPlane.direction), [0, 0, -1]);
    expect(apply(motion, tiltedPlane.origin)[2]).toBeCloseTo(0.05, 12);
  });

  it("leaves a positive offset as a gap, and points along the target normal with flip", () => {
    const gap = PLANE_ON_PLANE_MOTION([tiltedPlane, targetPlane], { ...NONE, offset: 0.002 });
    expect(apply(gap, tiltedPlane.origin)[2]).toBeCloseTo(0.052, 12);
    const flipped = PLANE_ON_PLANE_MOTION([tiltedPlane, targetPlane], { ...NONE, flip: true });
    expectVector(rotate(flipped.rotation, tiltedPlane.direction), [0, 0, 1]);
  });

  it("turns by the rotation about the target normal through the moved origin", () => {
    const placed = PLANE_ON_PLANE_MOTION([tiltedPlane, targetPlane], NONE);
    const turned = PLANE_ON_PLANE_MOTION([tiltedPlane, targetPlane], {
      ...NONE,
      rotation: Math.PI / 2,
    });
    const origin = apply(placed, tiltedPlane.origin);
    const quarterTurn = turnAbout(origin, [0, 0, 1], Math.PI / 2);
    const points: Vector3[] = [tiltedPlane.origin, [1, 2, 3]];
    for (const point of points) {
      expectVector(apply(turned, point), apply(quarterTurn, apply(placed, point)));
    }
  });
});

const targetAxis = frame([0.02, 0.015, 0], [0, 0, 1]);

describe("axis on axis", () => {
  it("puts the moving axis on the target axis, keeping its axial position and its side", () => {
    // Points down: the B-rep sign is arbitrary, so it is not turned over.
    const moving = frame([0.5, 0.3, 0.12], [0.1, 0, -1]);
    const motion = AXIS_ON_AXIS_MOTION([moving, targetAxis], NONE);
    expectVector(rotate(motion.rotation, moving.direction), [0, 0, -1]);
    expectVector(apply(motion, moving.origin), [0.02, 0.015, 0.12]);
  });

  it("keeps the target axis' own sign for a moving axis perpendicular to it", () => {
    const moving = frame([0.5, 0.3, 0.12], [1, 0, 0]);
    const motion = AXIS_ON_AXIS_MOTION([moving, targetAxis], NONE);
    expectVector(rotate(motion.rotation, moving.direction), [0, 0, 1]);
  });

  it("turns the axis over with flip and shifts it by the offset along the target axis", () => {
    const moving = frame([0.5, 0.3, 0.12], [0, 0, 1]);
    const motion = AXIS_ON_AXIS_MOTION([moving, targetAxis], { ...NONE, flip: true, offset: 0.01 });
    expectVector(rotate(motion.rotation, moving.direction), [0, 0, -1]);
    expectVector(apply(motion, moving.origin), [0.02, 0.015, 0.13]);
  });

  it("keeps a plane contact made before when the axis is perpendicular to that plane", () => {
    const plane = frame([0.3, 0.2, 0.01], [0.2, 0.1, -1]);
    const hole = frame([0.31, 0.21, 0.01], [0.2, 0.1, -1]);
    const first = PLANE_ON_PLANE_MOTION([plane, targetPlane], NONE);
    const movedHole = {
      origin: apply(first, hole.origin),
      direction: rotate(first.rotation, hole.direction),
    };
    const second = AXIS_ON_AXIS_MOTION([movedHole, targetAxis], NONE);
    const both = compose(second, first);
    expectVector(rotate(both.rotation, plane.direction), [0, 0, -1]);
    expect(apply(both, plane.origin)[2]).toBeCloseTo(0.05, 12);
    const [x, y] = apply(both, hole.origin);
    expectVector([x, y, 0], [0.02, 0.015, 0]);
  });
});

const pivot = frame([0, 0, 0], [0, 0, 1]);
const targetHole = frame([0.04, 0, 0], [0, 0, 1]);

describe("axis around a pivot", () => {
  it("turns about the pivot axis only, bringing the moving hole onto the target hole", () => {
    const movingHole = frame([0, 0.04, 0.01], [0, 0, -1]);
    const motion = AXIS_AROUND_PIVOT_MOTION([pivot, movingHole, targetHole], NONE);
    expectVector(apply(motion, movingHole.origin), [0.04, 0, 0.01]);
    expectVector(apply(motion, [0, 0, 0.3]), [0, 0, 0.3]);
  });

  it("refuses axes that are not parallel", () => {
    const tilted = frame([0, 0.04, 0], [0, 0.01, 1]);
    expect(() => AXIS_AROUND_PIVOT_MOTION([pivot, tilted, targetHole], NONE)).toThrow(
      /parallel axes/,
    );
  });

  it("refuses a hole on the pivot axis", () => {
    const onAxis = frame([0, 0, 0.02], [0, 0, 1]);
    expect(() => AXIS_AROUND_PIVOT_MOTION([pivot, onAxis, targetHole], NONE)).toThrow(
      /moving hole lies on the pivot axis/,
    );
  });
});
