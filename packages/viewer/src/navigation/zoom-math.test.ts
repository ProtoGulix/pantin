import { describe, expect, it } from "vitest";
import {
  cursorZoomTargetShift,
  dragZoomFactor,
  factorWithinLimits,
  orthographicBounds,
  visibleHalfHeight,
  wheelZoomFactor,
} from "./zoom-math.ts";

describe("wheelZoomFactor", () => {
  it("zooms out when pushed forward under SolidWorks and in when pulled back", () => {
    expect(wheelZoomFactor(-100, true, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, true, false)).toBeLessThan(1);
  });

  it("zooms in when pushed forward under the other direction", () => {
    expect(wheelZoomFactor(-100, false, false)).toBeLessThan(1);
  });

  it("reverses the preset's direction", () => {
    expect(wheelZoomFactor(-100, true, true)).toBeLessThan(1);
    expect(wheelZoomFactor(-100, false, true)).toBeGreaterThan(1);
  });

  it("bounds one big turn", () => {
    expect(wheelZoomFactor(100000, false, false)).toBe(2);
    expect(wheelZoomFactor(-100000, false, false)).toBe(0.5);
  });
});

describe("dragZoomFactor", () => {
  it("zooms in when dragging up", () => {
    expect(dragZoomFactor(-20)).toBeLessThan(1);
    expect(dragZoomFactor(20)).toBeGreaterThan(1);
  });
});

describe("factorWithinLimits", () => {
  it("keeps the radius inside its limits", () => {
    expect(factorWithinLimits(10, 0.1, 5, null)).toBeCloseTo(0.5);
    expect(factorWithinLimits(10, 3, null, 20)).toBeCloseTo(2);
  });

  it("stops a zoom out at the largest half height", () => {
    expect(factorWithinLimits(4, 3, 0.04, 10)).toBeCloseTo(2.5);
  });

  it("leaves a factor alone without limits", () => {
    expect(factorWithinLimits(10, 0.1, null, null)).toBeCloseTo(0.1);
  });
});

describe("orthographicBounds", () => {
  it("is the half height tall and aspect times wider", () => {
    const bounds = orthographicBounds(3, 2);
    expect(bounds).toEqual({ left: -6, right: 6, top: 3, bottom: -3 });
  });

  it("covers what the perspective camera shows at the target distance", () => {
    expect(orthographicBounds(visibleHalfHeight(5, 0.8), 1).top).toBeCloseTo(5 * Math.tan(0.4));
  });
});

describe("cursorZoomTargetShift", () => {
  it("does not move the target when the cursor is at the centre", () => {
    expect(cursorZoomTargetShift(0, 0, 4, 3, 0.5)).toEqual({ right: 0, up: 0 });
  });

  it("keeps the point under the cursor under it", () => {
    const [cursorX, cursorY, halfWidth, halfHeight, factor] = [0.5, -0.25, 4, 3, 0.8] as const;
    const shift = cursorZoomTargetShift(cursorX, cursorY, halfWidth, halfHeight, factor);
    // The point under the cursor, relative to the target, before and after.
    const pointRight = cursorX * halfWidth;
    const pointUp = cursorY * halfHeight;
    const afterRight = (pointRight - shift.right) / (halfWidth * factor);
    const afterUp = (pointUp - shift.up) / (halfHeight * factor);
    expect(afterRight).toBeCloseTo(cursorX);
    expect(afterUp).toBeCloseTo(cursorY);
  });

  it("moves the target towards the cursor when zooming in", () => {
    expect(cursorZoomTargetShift(1, 1, 2, 2, 0.5).right).toBeGreaterThan(0);
    expect(cursorZoomTargetShift(-1, -1, 2, 2, 0.5).up).toBeLessThan(0);
  });
});
