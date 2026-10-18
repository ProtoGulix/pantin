import { describe, expect, it } from "vitest";
import { glyphOf, glyphSize } from "./volume-glyph.ts";

describe("glyphOf", () => {
  it("marks the emitter with a plus and the absorber with a minus sign", () => {
    expect(glyphOf("emitter")).toBe("+");
    expect(glyphOf("absorber")).toBe("−");
  });

  it("leaves the other volumes without a glyph", () => {
    for (const style of ["belt", "guide", "receiver"] as const) {
      expect(glyphOf(style)).toBeNull();
    }
  });
});

describe("glyphSize", () => {
  it("keeps a constant share of the screen", () => {
    expect(glyphSize(5, 10)).toBeCloseTo(0.2);
    expect(glyphSize(10, 10)).toBeCloseTo(0.4);
  });

  it("never exceeds the longest side of its volume", () => {
    expect(glyphSize(100, 0.3)).toBe(0.3);
  });

  it("never vanishes when the camera is close", () => {
    expect(glyphSize(0.1, 0.5)).toBe(0.02);
  });
});
