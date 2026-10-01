import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPantinStore } from "../store/pantin-store.ts";
import { createPantinService } from "./pantin-service.ts";

// A failing simulation step (ADR 0031 point 3). The step function is replaced:
// no real document makes it throw, which is the point of the safeguard.

const failing = vi.hoisted(() => ({ names: new Set<string>(), message: "step exploded" }));

vi.mock("../domain/simulation-step.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../domain/simulation-step.ts")>();
  return {
    ...original,
    stepSimulation: (...args: Parameters<typeof original.stepSimulation>) => {
      if (failing.names.has(args[0].name)) {
        throw new Error(failing.message);
      }
      return original.stepSimulation(...args);
    },
  };
});

let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-step-error-"));
  failing.names.clear();
  failing.message = "step exploded";
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

function runSteps(service: ReturnType<typeof createPantinService>, steps: number): void {
  service.runSimulationSteps({ steps, droppedSteps: 0, now: 0 });
}

function startService() {
  const reported: unknown[] = [];
  const service = createPantinService(createPantinStore(pantinsDirectory), undefined, {
    wallClock: () => new Date("2026-10-01T12:00:00.000Z"),
    reportStepError: (error) => reported.push(error),
  });
  return { service, reported };
}

describe("the console id", () => {
  it("comes from the injected source, one per opened Pantin", async () => {
    const ids = ["console-a", "console-b"];
    const service = createPantinService(createPantinStore(pantinsDirectory), undefined, {
      newConsoleId: () => ids.shift() ?? "none",
    });
    await service.createPantin("One");
    await service.createPantin("Two");
    expect((await service.readConsole("one", 0)).consoleId).toBe("console-a");
    expect((await service.readConsole("two", 0)).consoleId).toBe("console-b");
  });
});

describe("a simulation step that throws", () => {
  it("is skipped and put in the console, and the other Pantins keep stepping", async () => {
    const { service } = startService();
    await service.createPantin("Bad");
    await service.createPantin("Good");
    failing.names.add("Bad");
    expect(() => runSteps(service, 3)).not.toThrow();
    expect(service.peekStepCount("bad")).toBe(0);
    expect(service.peekStepCount("good")).toBe(3);
    const { entries } = await service.readConsole("bad", 0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      code: "step_error",
      level: "error",
      source: { kind: "pantin" },
      params: { detail: "step exploded" },
      wallTime: "2026-10-01T12:00:00.000Z",
    });
    expect((await service.readConsole("good", 0)).entries).toEqual([]);
  });

  it("folds the repeats, reports the error once, and resumes when the cause is gone", async () => {
    const { service, reported } = startService();
    await service.createPantin("Bad");
    failing.names.add("Bad");
    for (let tick = 0; tick < 50; tick += 1) {
      runSteps(service, 1);
    }
    const { entries } = await service.readConsole("bad", 0);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(50);
    expect(reported).toHaveLength(1);
    failing.names.clear();
    runSteps(service, 2);
    expect(service.peekStepCount("bad")).toBe(2);
  });

  it("starts a new entry when the error changes", async () => {
    const { service, reported } = startService();
    await service.createPantin("Bad");
    failing.names.add("Bad");
    runSteps(service, 1);
    failing.message = "another failure";
    runSteps(service, 1);
    expect((await service.readConsole("bad", 0)).entries.map((entry) => entry.params)).toEqual([
      { detail: "step exploded" },
      { detail: "another failure" },
    ]);
    expect(reported).toHaveLength(2);
  });
});

describe("a step request that throws", () => {
  it("stops there, and the answer shows the steps that ran", async () => {
    const { service } = startService();
    await service.createPantin("Bad");
    await service.setClockRunning("bad", false);
    await service.stepClock("bad", 3);
    failing.names.add("Bad");
    const clock = await service.stepClock("bad", 5);
    expect(clock).toMatchObject({ running: false, step: 3 });
    expect((await service.readConsole("bad", 0)).entries.map((entry) => entry.code)).toEqual([
      "clock_paused",
      "step_error",
    ]);
    failing.names.clear();
    expect((await service.stepClock("bad", 2)).step).toBe(5);
  });
});

describe("the achieved ratio of a Pantin whose steps throw", () => {
  it("drops for that Pantin only", async () => {
    const { service } = startService();
    await service.createPantin("Bad");
    await service.createPantin("Good");
    failing.names.add("Bad");
    for (let tick = 0; tick < 130; tick += 1) {
      service.runSimulationSteps({ steps: 1, droppedSteps: 0, now: tick / 100 });
    }
    expect((await service.getClock("bad")).achievedRatio).toBe(0);
    expect((await service.getClock("good")).achievedRatio).toBe(1);
  });
});
