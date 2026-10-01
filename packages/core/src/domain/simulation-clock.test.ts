import { describe, expect, it } from "vitest";
import {
  achievedRatio,
  EMPTY_RATIO_WINDOW,
  type RatioWindow,
  recordTick,
} from "./simulation-clock.ts";

function recordTicks(count: number, due: number, executed: number, from = 0): RatioWindow {
  let window = EMPTY_RATIO_WINDOW;
  for (let tick = 0; tick < count; tick += 1) {
    window = recordTick(window, { time: from + tick / 100, due, executed });
  }
  return window;
}

describe("achievedRatio", () => {
  it("is null before the window has been filled once", () => {
    expect(achievedRatio(EMPTY_RATIO_WINDOW)).toBeNull();
    expect(achievedRatio(recordTicks(50, 1, 1))).toBeNull();
  });

  it("is executed over due once the window is filled", () => {
    expect(achievedRatio(recordTicks(101, 1, 1))).toBe(1);
    expect(achievedRatio(recordTicks(101, 4, 1))).toBe(0.25);
  });

  it("forgets the samples older than the window", () => {
    const stalled = recordTicks(101, 4, 1);
    expect(achievedRatio(stalled)).toBe(0.25);
    expect(achievedRatio(recordTick(stalled, { time: 5, due: 1, executed: 1 }))).toBe(1);
  });

  it("is null when nothing was due", () => {
    expect(achievedRatio(recordTicks(101, 0, 0))).toBeNull();
  });
});
