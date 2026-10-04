import { describe, expect, it } from "vitest";
import {
  CONSOLE_HEIGHT_DEFAULT,
  clampColumns,
  clampConsoleHeight,
  clampSplitRatio,
  parseStoredNumber,
  SPLIT_RATIO_DEFAULT,
  SPLITTER_KEYBOARD_STEP,
  splitRatioAfterMove,
} from "./layout-sizes.ts";

describe("layout sizes", () => {
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

  it("keeps both columns when the 3D view has room", () => {
    expect(clampColumns({ panel: 320, inspector: 340 }, 1600)).toEqual({
      panel: 320,
      inspector: 340,
    });
  });

  it("narrows the inspector first, then the left column", () => {
    expect(clampColumns({ panel: 320, inspector: 340 }, 950)).toEqual({
      panel: 320,
      inspector: 302,
    });
    expect(clampColumns({ panel: 320, inspector: 340 }, 850)).toEqual({
      panel: 262,
      inspector: 260,
    });
  });

  it("never goes under the minimum of a column", () => {
    expect(clampColumns({ panel: 100, inspector: 100 }, 1600)).toEqual({
      panel: 220,
      inspector: 260,
    });
  });

  it("falls back to the defaults on corrupt widths", () => {
    expect(clampColumns({ panel: Number.NaN, inspector: Number.NaN }, 1600)).toEqual({
      panel: 320,
      inspector: 340,
    });
  });

  it("counts a hidden inspector and its splitter for nothing", () => {
    expect(clampColumns({ panel: 600, inspector: 340 }, 1000, false)).toEqual({
      panel: 600,
      inspector: 340,
    });
    expect(clampColumns({ panel: 900, inspector: 340 }, 1000, false).panel).toBe(676);
  });

  it("keeps 320 px for the 3D view with both splitters", () => {
    const { panel, inspector } = clampColumns({ panel: 900, inspector: 900 }, 1200);
    expect(1200 - panel - inspector - 8).toBeGreaterThanOrEqual(320);
  });
});
