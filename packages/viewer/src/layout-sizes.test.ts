import { describe, expect, it } from "vitest";
import {
  CONSOLE_HEIGHT_DEFAULT,
  clampConsoleHeight,
  clampPanelWidth,
  clampSplitRatio,
  PANEL_WIDTH_DEFAULT,
  parseStoredNumber,
  SPLIT_RATIO_DEFAULT,
  SPLITTER_KEYBOARD_STEP,
  splitRatioAfterMove,
} from "./layout-sizes.ts";

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

describe("split ratio", () => {
  it("starts at 60 % for the 3D view", () => {
    expect(SPLIT_RATIO_DEFAULT).toBe(0.6);
  });

  it("keeps 120 px for each half", () => {
    expect(clampSplitRatio(0.01, 1000)).toBeCloseTo(0.12);
    expect(clampSplitRatio(0.99, 1000)).toBeCloseTo(0.88);
    expect(clampSplitRatio(0.5, 1000)).toBe(0.5);
  });

  it("never crosses the middle in an area too small for two minimums", () => {
    expect(clampSplitRatio(0.9, 200)).toBe(0.5);
    expect(clampSplitRatio(0.1, 200)).toBe(0.5);
  });

  it("falls back to the default on a corrupt value or an empty area", () => {
    expect(clampSplitRatio(Number.NaN, 800)).toBe(SPLIT_RATIO_DEFAULT);
    expect(clampSplitRatio(0.4, 0)).toBe(SPLIT_RATIO_DEFAULT);
  });

  it("moves by a drag or one keyboard step, and stops at the clamp", () => {
    expect(splitRatioAfterMove(0.6, -100, 1000)).toBeCloseTo(0.5);
    expect(splitRatioAfterMove(0.6, SPLITTER_KEYBOARD_STEP, 800)).toBeCloseTo(0.62);
    expect(splitRatioAfterMove(0.6, 5000, 1000)).toBeCloseTo(0.88);
  });
});

describe("console height", () => {
  it("keeps the console between its minimum and what leaves room above it", () => {
    expect(clampConsoleHeight(20, 800)).toBe(80);
    expect(clampConsoleHeight(250.4, 800)).toBe(250);
    expect(clampConsoleHeight(790, 800)).toBe(640);
  });

  it("keeps its minimum in a tiny window, and falls back to the default on a corrupt value", () => {
    expect(clampConsoleHeight(300, 100)).toBe(80);
    expect(clampConsoleHeight(Number.NaN, 800)).toBe(CONSOLE_HEIGHT_DEFAULT);
    expect(clampConsoleHeight(Number.POSITIVE_INFINITY, 800)).toBe(CONSOLE_HEIGHT_DEFAULT);
  });
});
