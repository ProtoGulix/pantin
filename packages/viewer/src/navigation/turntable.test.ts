import { describe, expect, it } from "vitest";
import {
  arrowPan,
  arrowRotation,
  fromScreenAxes,
  isArrowKey,
  targetKeepingPivot,
  toScreenAxes,
  type Vector,
  viewBasis,
} from "./turntable.ts";

function expectVector(actual: Vector, expected: Vector): void {
  for (const index of [0, 1, 2] as const) {
    expect(actual[index]).toBeCloseTo(expected[index], 9);
  }
}

describe("viewBasis", () => {
  it("looks along +Z from -Z with +X on the right and Y up", () => {
    const basis = viewBasis(-Math.PI / 2, Math.PI / 2);
    expectVector(basis.back, [0, 0, -1]);
    expectVector(basis.right, [1, 0, 0]);
    expectVector(basis.up, [0, 1, 0]);
  });

  it("keeps the screen's up towards +Z of the floor plane seen from above", () => {
    const basis = viewBasis(-Math.PI / 2, 0.01);
    expect(basis.up[2]).toBeGreaterThan(0.99);
  });

  it("keeps the vertical axis vertical on screen: right is always horizontal", () => {
    for (const [alpha, beta] of [
      [0.3, 1.1],
      [2.5, 0.4],
      [-1, 2.9],
    ] as const) {
      expect(viewBasis(alpha, beta).right[1]).toBe(0);
    }
  });
});

describe("screen axes", () => {
  it("round-trips a vector", () => {
    const basis = viewBasis(0.7, 1.2);
    const vector: Vector = [1, -2, 3];
    expectVector(fromScreenAxes(toScreenAxes(vector, basis), basis), vector);
  });
});

describe("targetKeepingPivot", () => {
  it("is the old target when the camera did not turn", () => {
    const basis = viewBasis(0.7, 1.2);
    const target: Vector = [1, 2, 3];
    const pivot: Vector = [2, 2.5, 1];
    const onScreen = toScreenAxes(
      [pivot[0] - target[0], pivot[1] - target[1], pivot[2] - target[2]],
      basis,
    );
    expectVector(targetKeepingPivot(pivot, onScreen, basis), target);
  });

  it("keeps the pivot at the same place on screen after a turn", () => {
    const before = viewBasis(0.7, 1.2);
    const target: Vector = [1, 2, 3];
    const pivot: Vector = [2, 2.5, 1];
    const onScreen = toScreenAxes(
      [pivot[0] - target[0], pivot[1] - target[1], pivot[2] - target[2]],
      before,
    );
    const after = viewBasis(1.5, 0.9);
    const newTarget = targetKeepingPivot(pivot, onScreen, after);
    const seenAfter = toScreenAxes(
      [pivot[0] - newTarget[0], pivot[1] - newTarget[1], pivot[2] - newTarget[2]],
      after,
    );
    expectVector(seenAfter, onScreen);
  });

  it("is the pivot itself when it was the target", () => {
    const basis = viewBasis(2, 1);
    expectVector(targetKeepingPivot([4, 5, 6], [0, 0, 0], basis), [4, 5, 6]);
  });
});

describe("arrow keys", () => {
  it("knows the four arrows", () => {
    expect(isArrowKey("ArrowLeft")).toBe(true);
    expect(isArrowKey("f")).toBe(false);
  });

  it("turns by the step, and by a quarter turn with Shift", () => {
    expect(arrowRotation("ArrowLeft", false, 15).alpha).toBeCloseTo(Math.PI / 12);
    expect(arrowRotation("ArrowRight", true, 15).alpha).toBeCloseTo(-Math.PI / 2);
    expect(arrowRotation("ArrowUp", false, 30).beta).toBeCloseTo(Math.PI / 6);
    expect(arrowRotation("ArrowDown", true, 5).beta).toBeCloseTo(-Math.PI / 2);
  });

  it("turns only one angle per arrow", () => {
    expect(arrowRotation("ArrowLeft", false, 15).beta).toBe(0);
    expect(arrowRotation("ArrowUp", false, 15).alpha).toBe(0);
  });

  it("pans a tenth of the visible height, the target going against the arrow", () => {
    expect(arrowPan("ArrowRight", 5)).toEqual({ right: -1, up: 0 });
    expect(arrowPan("ArrowLeft", 5)).toEqual({ right: 1, up: 0 });
    expect(arrowPan("ArrowUp", 5)).toEqual({ right: 0, up: -1 });
    expect(arrowPan("ArrowDown", 5)).toEqual({ right: 0, up: 1 });
  });
});
