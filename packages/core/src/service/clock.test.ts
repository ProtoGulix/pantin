import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createPantinStore } from "../store/pantin-store.ts";
import { createManualTimer } from "../test-support/manual-timer.ts";
import { createPantinService } from "./pantin-service.ts";
import { startSimulationLoop } from "./simulation-loop.ts";

// The clock of an open Pantin on a manual timer (ADR 0032 points 1 to 6).

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-clock-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

async function startClockedService() {
  const service = createPantinService(createPantinStore(pantinsDirectory), undefined);
  const manual = createManualTimer();
  startSimulationLoop(manual.timer, service.runSimulationSteps, () => undefined);
  await service.createPantin("Axis");
  const runSteps = (count: number) => {
    for (let step = 0; step < count; step += 1) {
      manual.advance(STEP_SECONDS);
    }
  };
  return { service, manual, runSteps };
}

describe("pause and resume", () => {
  it("keeps the step count of a paused Pantin while time advances", async () => {
    const { service, runSteps } = await startClockedService();
    runSteps(10);
    await service.setClockRunning("axis", false);
    runSteps(50);
    expect(service.peekStepCount("axis")).toBe(10);
    expect((await service.getClock("axis")).running).toBe(false);
  });

  it("runs no catch-up on resume, and steps again with the next tick", async () => {
    const { service, manual, runSteps } = await startClockedService();
    await service.setClockRunning("axis", false);
    manual.advance(5);
    await service.setClockRunning("axis", true);
    expect(service.peekStepCount("axis")).toBe(0);
    runSteps(3);
    expect(service.peekStepCount("axis")).toBe(3);
  });

  it("only pauses the Pantin it was asked for", async () => {
    const { service, runSteps } = await startClockedService();
    await service.createPantin("Other");
    await service.setClockRunning("axis", false);
    runSteps(4);
    expect(service.peekStepCount("axis")).toBe(0);
    expect(service.peekStepCount("other")).toBe(4);
  });

  it("keeps the clock when the Pantin is discarded", async () => {
    const { service, runSteps } = await startClockedService();
    runSteps(7);
    const step = service.peekStepCount("axis");
    await service.setClockRunning("axis", false);
    await service.discardPantin("axis");
    expect(await service.getClock("axis")).toMatchObject({ running: false, step });
  });
});

describe("clock console entries", () => {
  it("writes one entry per real change, and none for a repeat or a step", async () => {
    const { service } = await startClockedService();
    await service.setClockRunning("axis", true);
    await service.setClockRunning("axis", false);
    await service.setClockRunning("axis", false);
    await service.stepClock("axis", 2);
    await service.setClockRunning("axis", true);
    const { entries } = await service.readConsole("axis", 0);
    expect(entries.map((entry) => [entry.code, entry.level, entry.source])).toEqual([
      ["clock_paused", "info", { kind: "pantin" }],
      ["clock_resumed", "info", { kind: "pantin" }],
    ]);
  });
});

describe("achieved ratio", () => {
  it("is null at first, then 1 under a healthy timer", async () => {
    const { service, runSteps } = await startClockedService();
    runSteps(60);
    expect((await service.getClock("axis")).achievedRatio).toBeNull();
    runSteps(70);
    expect(await service.getClock("axis")).toMatchObject({ achievedRatio: 1, droppedSteps: 0 });
  });

  it("drops under a stall, which also counts the dropped steps", async () => {
    const { service, manual, runSteps } = await startClockedService();
    runSteps(130);
    manual.advance(1);
    const clock = await service.getClock("axis");
    expect(clock.droppedSteps).toBe(120 - 12);
    expect(clock.achievedRatio).toBeLessThan(0.6);
  });

  it("starts over after a pause, paused time being outside the window", async () => {
    const { service, manual, runSteps } = await startClockedService();
    runSteps(130);
    await service.setClockRunning("axis", false);
    manual.advance(10);
    await service.setClockRunning("axis", true);
    expect((await service.getClock("axis")).achievedRatio).toBeNull();
    runSteps(130);
    expect((await service.getClock("axis")).achievedRatio).toBe(1);
  });

  it("counts a stall in the first tick after a resume", async () => {
    const { service, manual, runSteps } = await startClockedService();
    await service.setClockRunning("axis", false);
    await service.setClockRunning("axis", true);
    manual.advance(1);
    const { achievedRatio } = await service.getClock("axis");
    expect(achievedRatio).toBeCloseTo(0.1, 5);
    runSteps(130);
    expect((await service.getClock("axis")).achievedRatio).toBe(1);
  });

  it("is not changed by dropped steps of a paused Pantin", async () => {
    const { service, manual } = await startClockedService();
    await service.setClockRunning("axis", false);
    manual.advance(5);
    expect((await service.getClock("axis")).droppedSteps).toBe(0);
  });
});
