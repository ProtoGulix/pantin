import { describe, expect, it } from "vitest";
import { axisChoiceOf, axisVectorOf, parseAxisDirection, reversedAxis } from "./axis-choice.ts";

describe("axisChoiceOf", () => {
  it("recognises a principal direction and its sense", () => {
    expect(axisChoiceOf([0, 0, 1])).toEqual({ direction: "z", reversed: false });
    expect(axisChoiceOf([-1, 0, 0])).toEqual({ direction: "x", reversed: true });
    expect(axisChoiceOf([0, 2.5, 0])).toEqual({ direction: "y", reversed: false });
  });

  it("calls any other vector custom, its sense given by the first non-zero component", () => {
    expect(axisChoiceOf([1, 1, 0])).toEqual({ direction: "custom", reversed: false });
    expect(axisChoiceOf([0, -1, 1])).toEqual({ direction: "custom", reversed: true });
    expect(axisChoiceOf([0, 0, 0])).toEqual({ direction: "custom", reversed: false });
  });
});

describe("axisVectorOf", () => {
  it("gives the unit vector of a direction, negated when reversed", () => {
    expect(axisVectorOf("x", false)).toEqual([1, 0, 0]);
    expect(axisVectorOf("z", true)).toEqual([0, 0, -1]);
  });

  it("round-trips through axisChoiceOf", () => {
    for (const direction of ["x", "y", "z"] as const) {
      for (const reversed of [false, true]) {
        expect(axisChoiceOf(axisVectorOf(direction, reversed))).toEqual({ direction, reversed });
      }
    }
  });
});

describe("reversedAxis", () => {
  it("negates every component without producing -0", () => {
    const reversed = reversedAxis([0, -2, 3]);
    expect(reversed).toEqual([0, 2, -3]);
    expect(Object.is(reversed[0], -0)).toBe(false);
  });
});

describe("parseAxisDirection", () => {
  it("accepts only x, y and z", () => {
    expect(parseAxisDirection("y")).toBe("y");
    expect(parseAxisDirection("custom")).toBeNull();
    expect(parseAxisDirection("X")).toBeNull();
  });
});
