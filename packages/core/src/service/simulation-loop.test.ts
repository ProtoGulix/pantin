import { describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createManualTimer } from "../test-support/manual-timer.ts";
import { startSimulationLoop } from "./simulation-loop.ts";

describe("startSimulationLoop", () => {
  it("runs the steps due since the previous tick", () => {
    const manual = createManualTimer();
    const runs: number[] = [];
    startSimulationLoop(
      manual.timer,
      (tick) => runs.push(tick.steps),
      () => undefined,
    );
    manual.advance(STEP_SECONDS * 2.5);
    manual.advance(STEP_SECONDS * 0.6);
    expect(runs).toEqual([2, 1]);
  });
});

describe("startSimulationLoop ticks", () => {
  it("tells the dropped steps and the time of the tick", () => {
    const manual = createManualTimer();
    const ticks: unknown[] = [];
    startSimulationLoop(
      manual.timer,
      (tick) => ticks.push(tick),
      () => undefined,
    );
    manual.advance(1);
    expect(ticks).toEqual([{ steps: 12, droppedSteps: 108, now: 1 }]);
  });
});

describe("startSimulationLoop failures and stop", () => {
  it("reports a failing step and keeps running", () => {
    const manual = createManualTimer();
    const reported: unknown[] = [];
    const failure = new Error("step failed");
    startSimulationLoop(
      manual.timer,
      () => {
        throw failure;
      },
      (error) => reported.push(error),
    );
    manual.advance(STEP_SECONDS);
    manual.advance(STEP_SECONDS);
    expect(reported).toEqual([failure, failure]);
    expect(manual.isRunning()).toBe(true);
  });

  it("stops its timer", () => {
    const manual = createManualTimer();
    startSimulationLoop(
      manual.timer,
      () => undefined,
      () => undefined,
    ).stop();
    expect(manual.isRunning()).toBe(false);
  });
});
