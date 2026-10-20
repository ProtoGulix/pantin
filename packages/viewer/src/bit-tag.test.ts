import { describe, expect, it } from "vitest";
import { isBitOn } from "./bit-tag.ts";

describe("isBitOn", () => {
  it("reads 0 and values below one half as off", () => {
    expect(isBitOn(0)).toBe(false);
    expect(isBitOn(0.49)).toBe(false);
    expect(isBitOn(-1)).toBe(false);
  });

  it("reads one half and above as on", () => {
    expect(isBitOn(0.5)).toBe(true);
    expect(isBitOn(1)).toBe(true);
    expect(isBitOn(42)).toBe(true);
  });
});
