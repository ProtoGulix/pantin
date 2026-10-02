import { describe, expect, it } from "vitest";
import { babylonToCorePosition, type Vector3Tuple } from "../frames.ts";
import {
  anglesAt,
  anglesFromDirection,
  easedProgress,
  isStandardViewId,
  STANDARD_VIEW_IDS,
  STANDARD_VIEWS,
  shortestAlpha,
} from "./standard-views.ts";
import { viewBasis } from "./turntable.ts";

// Screen axes of the camera of a view, in the core frame.
function screenAxes(id: (typeof STANDARD_VIEW_IDS)[number]) {
  const { alpha, beta } = anglesFromDirection(STANDARD_VIEWS[id].camera);
  const basis = viewBasis(alpha, beta);
  return {
    right: babylonToCorePosition(basis.right),
    up: babylonToCorePosition(basis.up),
    back: babylonToCorePosition(basis.back),
  };
}

function expectClose(actual: Vector3Tuple, expected: Vector3Tuple, digits = 1): void {
  for (const index of [0, 1, 2] as const) {
    expect(actual[index]).toBeCloseTo(expected[index], digits);
  }
}

describe("standard views", () => {
  it.each(["front", "back", "left", "right", "top", "bottom"] as const)(
    "%s has the screen right and up of the ADR table",
    (id) => {
      const { right, up } = screenAxes(id);
      const { right: wantedRight, up: wantedUp } = STANDARD_VIEWS[id];
      // Top and Bottom stay 0.6 degrees off the vertical (Babylon's beta limit).
      expectClose(right, wantedRight ?? [0, 0, 0], 2);
      expectClose(up, wantedUp ?? [0, 0, 0], 1);
    },
  );

  it.each(STANDARD_VIEW_IDS)("%s puts the camera on its side of the target", (id) => {
    const { back } = screenAxes(id);
    const wanted = STANDARD_VIEWS[id].camera;
    const alignment = back[0] * wanted[0] + back[1] * wanted[1] + back[2] * wanted[2];
    expect(alignment).toBeGreaterThan(0.9999);
  });

  it("looks at the isometric view from the front right top octant, with Z vertical on screen", () => {
    const { right, up, back } = screenAxes("isometric");
    expectClose(back, [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)], 6);
    expect(right[2]).toBeCloseTo(0, 9);
    expect(up[2]).toBeGreaterThan(0.8);
  });

  it("uses beta = acos(1 / sqrt 3) for the isometric view", () => {
    expect(anglesFromDirection(STANDARD_VIEWS.isometric.camera).beta).toBeCloseTo(
      Math.acos(1 / Math.sqrt(3)),
      9,
    );
  });

  it("keeps beta off the poles for Top and Bottom, with the same alpha", () => {
    const top = anglesFromDirection(STANDARD_VIEWS.top.camera);
    const bottom = anglesFromDirection(STANDARD_VIEWS.bottom.camera);
    expect(top.beta).toBeCloseTo(0.01, 9);
    expect(bottom.beta).toBeCloseTo(Math.PI - 0.01, 9);
    expect(top.alpha).toBe(bottom.alpha);
  });

  it("recognises view ids", () => {
    expect(isStandardViewId("front")).toBe(true);
    expect(isStandardViewId("oblique")).toBe(false);
  });
});

describe("view change animation", () => {
  it("goes the short way round in alpha", () => {
    expect(shortestAlpha(3, -3)).toBeCloseTo(-3 + 2 * Math.PI, 9);
    expect(shortestAlpha(-3, 3)).toBeCloseTo(3 - 2 * Math.PI, 9);
    expect(shortestAlpha(0.5, 0.7)).toBeCloseTo(0.7, 9);
  });

  it("interpolates from the start to the end across the wrap", () => {
    const middle = anglesAt({ alpha: 3, beta: 1 }, { alpha: -3, beta: 2 }, 0.5);
    expect(middle.alpha).toBeCloseTo(3 + (2 * Math.PI - 6) / 2, 9);
    expect(middle.beta).toBeCloseTo(1.5, 9);
  });

  it("eases from 0 to 1 over 300 ms", () => {
    expect(easedProgress(0)).toBe(0);
    expect(easedProgress(150)).toBeCloseTo(0.5, 9);
    expect(easedProgress(300)).toBe(1);
    expect(easedProgress(1000)).toBe(1);
    expect(easedProgress(-5)).toBe(0);
  });
});
