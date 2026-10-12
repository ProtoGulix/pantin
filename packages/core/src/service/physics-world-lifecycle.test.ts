import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { serializePantinDocument } from "../domain/pantin-document.ts";
import type { PhysicsWorldFactory } from "../domain/physics-world.ts";
import { createPantinStore } from "../store/pantin-store.ts";
import { belt, conveyorLine } from "../test-support/conveyor-fixtures.ts";
import { benchesClosedAfterEach } from "../test-support/physics-bench.ts";
import { testPhysicsWorldFactory } from "../test-support/physics-factory.ts";
import { resetRuntimeState } from "./open-pantins.ts";
import { createPantinService } from "./pantin-service.ts";

// The spawn latch, the console events, reset, rebuild and the world lifecycle
// of an open Pantin (ADR 0043 points 5, 10 and 11).

const open = benchesClosedAfterEach();

const SPAWN = "main.source.spawn";

function countingFactory() {
  const counts = { built: 0, disposed: 0, failNextStep: false, restored: 0 };
  const factory: PhysicsWorldFactory = (belts, guides) => {
    counts.built += 1;
    const world = testPhysicsWorldFactory(belts, guides);
    return {
      ...world,
      step: (input) => {
        if (counts.failNextStep) {
          counts.failNextStep = false;
          throw new Error("world exploded");
        }
        return world.step(input);
      },
      restore: (snapshot) => {
        counts.restored += 1;
        world.restore(snapshot);
      },
      dispose: () => {
        counts.disposed += 1;
        world.dispose();
      },
    };
  };
  return { factory, counts };
}

describe("the world of a Pantin", () => {
  it("is freed when rebuilt and when reset over another document", () => {
    const { factory, counts } = countingFactory();
    const bench = open(conveyorLine(), { physicsWorldFactory: factory });
    expect(counts).toMatchObject({ built: 1, disposed: 0 });
    bench.openPantin.document = { ...bench.openPantin.document, belts: [belt({ length: 2 })] };
    bench.step(1);
    expect(counts).toMatchObject({ built: 2, disposed: 1 });
    bench.openPantin.document = { ...bench.openPantin.document, belts: [] };
    resetRuntimeState(bench.context, bench.openPantin);
    expect(counts).toMatchObject({ built: 3, disposed: 2 });
  });

  it("goes back to its empty snapshot and reports step_error when the world throws", async () => {
    const { factory, counts } = countingFactory();
    const reported: unknown[] = [];
    const bench = open(conveyorLine(), { physicsWorldFactory: factory });
    bench.context.reportStepError = (error) => reported.push(error);
    await bench.write(SPAWN, 1);
    bench.step(10);
    expect(bench.products()).toHaveLength(1);
    counts.failNextStep = true;
    expect(bench.step(5)).toBe(0);
    expect(counts.restored).toBe(1);
    expect(bench.products()).toEqual([]);
    expect(bench.openPantin.stepCount).toBe(10);
    expect(bench.consoleCodes()).toEqual(["step_error"]);
    expect(reported).toHaveLength(1);
    // The Pantin carries on: the next spawn is p1 again.
    await bench.write(SPAWN, 0);
    await bench.write(SPAWN, 1);
    bench.step(1);
    expect(bench.products().map(({ id }) => id)).toEqual(["p1"]);
  });
});

describe("closing the service", () => {
  it("frees the world of every open Pantin", async () => {
    const { factory, counts } = countingFactory();
    const directory = await mkdtemp(join(tmpdir(), "pantin-physics-close-"));
    try {
      const service = createPantinService(createPantinStore(directory), undefined, {
        physicsWorldFactory: factory,
      });
      await service.createPantin("One");
      await service.createPantin("Two");
      expect(counts).toMatchObject({ built: 2, disposed: 0 });
      service.close();
      expect(counts.disposed).toBe(2);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

describe("service.resetRuntime", () => {
  it("clears the products and keeps unsaved edits, the clock and the step count", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pantin-physics-reset-"));
    try {
      const store = createPantinStore(directory);
      await createPantinService(store, undefined).createPantin("Line");
      await store.writeDocumentAtomically("line", serializePantinDocument(conveyorLine()));
      const service = createPantinService(store, undefined, {
        physicsWorldFactory: testPhysicsWorldFactory,
      });
      await service.renamePantin("line", "Renamed");
      await service.setClockRunning("line", false);
      await service.writeTag("line", SPAWN, 1);
      await service.stepClock("line", 30);
      await service.resetRuntime("line");
      expect((await service.getPantin("line")).unsavedChanges).toBe(true);
      expect(await service.getClock("line")).toMatchObject({ running: false, step: 30 });
      expect((await service.listTags("line")).tags.find(({ name }) => name === SPAWN)?.value).toBe(
        0,
      );
      // The old product is gone, so the emitter is not blocked by it.
      await service.writeTag("line", SPAWN, 1);
      await service.stepClock("line", 1);
      const codes = (await service.readConsole("line", 0)).entries.map(({ code }) => code);
      expect(codes).not.toContain("emitter_blocked");
      service.close();
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
