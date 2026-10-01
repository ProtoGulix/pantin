import { describe, expect, it } from "vitest";
import { clampPanelWidth, PANEL_WIDTH_DEFAULT, parseStoredNumber } from "./layout-sizes.ts";

describe("layout sizes", () => {
  it("keeps the panel between its minimum and what leaves room for the 3D view", () => {
    expect(clampPanelWidth(100, 1600)).toBe(220);
    expect(clampPanelWidth(400.4, 1600)).toBe(400);
    expect(clampPanelWidth(1500, 1600)).toBe(1280);
  });

  it("falls back to the default width on a corrupt value", () => {
    expect(clampPanelWidth(Number.NaN, 1600)).toBe(PANEL_WIDTH_DEFAULT);
  });

  it("parses stored numbers defensively", () => {
    expect(parseStoredNumber("360", 1)).toBe(360);
    expect(parseStoredNumber(null, 1)).toBe(1);
    expect(parseStoredNumber("", 1)).toBe(1);
    expect(parseStoredNumber("wide", 1)).toBe(1);
  });
});
