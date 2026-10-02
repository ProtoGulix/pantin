import { describe, expect, it } from "vitest";
import { snapRotationDelta, snapTranslationDelta } from "./placement-snapping.ts";

const about = (axis: 0 | 1 | 2, degrees: number) => {
  const half = (degrees * Math.PI) / 360;
  const parts: [number, number, number, number] = [0, 0, 0, Math.cos(half)];
  parts[axis] = Math.sin(half);
  return parts;
};

describe("snapTranslationDelta", () => {
  it("rounds the dragged axis to the step and zeroes the others exactly", () => {
    const snapped = snapTranslationDelta([0.01234, 3e-7, -2e-7], 1);
    expect(snapped[0]).toBeCloseTo(0.012, 12);
    expect(snapped[1]).toBe(0);
    expect(snapped[2]).toBe(0);
  });

  it("keeps the dragged distance, still on one axis, when snapping is off", () => {
    expect(snapTranslationDelta([1e-7, -0.01234, 0], null)).toEqual([0, -0.01234, 0]);
  });

  it("uses the step it is given and never returns minus zero", () => {
    expect(snapTranslationDelta([0.0128, 0, 0], 5)[0]).toBeCloseTo(0.015, 12);
    expect(Object.is(snapTranslationDelta([-0.0001, 0, 0], 1)[0], 0)).toBe(true);
  });
});

describe("snapRotationDelta", () => {
  it("rounds the angle about the dragged axis and drops the noise on the others", () => {
    const noisy: [number, number, number, number] = [...about(0, 31)] as never;
    noisy[1] = 4e-7;
    const [x, y, z, w] = snapRotationDelta(noisy, 15);
    expect(x).toBeCloseTo(Math.sin((30 * Math.PI) / 360), 12);
    expect([y, z]).toEqual([0, 0]);
    expect(w).toBeCloseTo(Math.cos((30 * Math.PI) / 360), 12);
  });

  it("keeps the sign and the shortest way round", () => {
    const [, , z] = snapRotationDelta(about(2, -100), 15);
    expect(z).toBeCloseTo(Math.sin((-105 * Math.PI) / 360), 12);
    const negated = about(2, 40).map((part) => -part);
    const [, , back] = snapRotationDelta(
      [negated[0] ?? 0, negated[1] ?? 0, negated[2] ?? 0, negated[3] ?? 0],
      15,
    );
    expect(back).toBeCloseTo(Math.sin((45 * Math.PI) / 360), 12);
  });

  it("keeps the dragged angle when snapping is off", () => {
    const [x] = snapRotationDelta(about(0, 31), null);
    expect(x).toBeCloseTo(Math.sin((31 * Math.PI) / 360), 12);
  });
});
