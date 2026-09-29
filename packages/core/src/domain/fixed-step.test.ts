import { describe, expect, it } from "vitest";
import { dueSteps, MAX_CATCH_UP_STEPS, STEP_SECONDS } from "./fixed-step.ts";

describe("dueSteps", () => {
  it("runs one step per 1/120 s elapsed", () => {
    expect(dueSteps(3 * STEP_SECONDS + STEP_SECONDS / 2, 0).steps).toBe(3);
  });

  it("carries the remainder to the next tick", () => {
    const first = dueSteps(STEP_SECONDS * 0.6, 0);
    expect(first.steps).toBe(0);
    const second = dueSteps(STEP_SECONDS * 0.6, first.carriedSeconds);
    expect(second.steps).toBe(1);
    expect(second.carriedSeconds).toBeCloseTo(STEP_SECONDS * 0.2, 12);
  });

  it("caps the catch-up after a stall and drops the rest", () => {
    expect(dueSteps(5, 0)).toEqual({ steps: MAX_CATCH_UP_STEPS, carriedSeconds: 0 });
  });

  it("treats a clock going backwards as no time elapsed", () => {
    expect(dueSteps(-1, 0)).toEqual({ steps: 0, carriedSeconds: 0 });
  });
});
