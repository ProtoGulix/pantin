import type { Absorber, PantinDocument, Placement } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import type { PhysicsWorld, PhysicsWorldFactory } from "../domain/physics-world.ts";
import { conveyorLine, photoelectricCell } from "../test-support/conveyor-fixtures.ts";
import { benchesClosedAfterEach } from "../test-support/physics-bench.ts";
import { testPhysicsWorldFactory } from "../test-support/physics-factory.ts";
import { resetRuntimeState } from "./open-pantins.ts";
import { listTags } from "./tag-operations.ts";

// Presence sensors in the step (ADR 0043 points 8, 10 and 11): rays cast once
// per step, outputs stored with the step, cleared by reset.

const open = benchesClosedAfterEach();

const SPAWN = "main.source.spawn";
// Box centre at x = -0.35, 0.05 up; a beam along +X from x = -0.6 hits it at once.
const ALONG_BELT: Placement = {
  translation: [-0.6, 0, 0.05],
  rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
};

function sensing(extra: Partial<PantinDocument> = {}): PantinDocument {
  return conveyorLine({
    presenceSensors: [photoelectricCell({ placement: ALONG_BELT, range: 0.5 })],
    ...extra,
  });
}

function spyingFactory(casts: { rays: number[] }): PhysicsWorldFactory {
  return (belts, guides) => {
    const world = testPhysicsWorldFactory(belts, guides);
    const spying: PhysicsWorld = {
      step: (input) => world.step(input),
      remove: (productIds) => world.remove(productIds),
      castRays: (rays) => {
        casts.rays.push(rays.length);
        return world.castRays(rays);
      },
      snapshot: () => world.snapshot(),
      restore: (snapshot) => world.restore(snapshot),
      dispose: () => world.dispose(),
    };
    return spying;
  };
}

async function stateTagOf(bench: ReturnType<typeof open>): Promise<number | undefined> {
  const listing = await listTags(bench.context, "line");
  return listing.tags.find((tag) => tag.name === "main.cell.state")?.value;
}

describe("a presence sensor in the step", () => {
  it("lists <assembly>.<tagKey>.state, 0 before a product, 1 while it sees one", async () => {
    const bench = open(sensing());
    bench.step(2);
    expect(await stateTagOf(bench)).toBe(0);
    await bench.write(SPAWN, 1);
    bench.step(1);
    expect(await stateTagOf(bench)).toBe(1);
  });

  it("casts one ray per sensor, once per step, and stores the output with the step", async () => {
    const casts = { rays: [] as number[] };
    const second = photoelectricCell({ id: "cell2", tagKey: "cell2", range: 0.1 });
    const bench = open(
      sensing({ presenceSensors: [photoelectricCell({ placement: ALONG_BELT }), second] }),
      { physicsWorldFactory: spyingFactory(casts) },
    );
    bench.step(3);
    expect(casts.rays).toEqual([2, 2, 2]);
    expect(bench.openPantin.physicsState.presenceOutputs.get("cell")).toEqual({ state: 0 });
    expect(bench.openPantin.physicsState.presenceStates.get("cell2")).toBeDefined();
  });

  it("casts nothing when the Pantin has no presence sensor", () => {
    const casts = { rays: [] as number[] };
    const bench = open(conveyorLine(), { physicsWorldFactory: spyingFactory(casts) });
    bench.step(3);
    expect(casts.rays).toEqual([]);
  });

  it("does not see a box absorbed in the same step", async () => {
    const absorberOverBox: Absorber = {
      id: "sink",
      name: "Sink",
      assembly: "main",
      placement: { translation: [-0.4, 0, 0], rotation: [0, 0, 0, 1] },
      size: [0.4, 0.4, 0.3],
    };
    const bench = open(sensing({ absorbers: [absorberOverBox] }));
    await bench.write(SPAWN, 1);
    bench.step(1);
    expect(bench.products()).toHaveLength(0);
    expect(await stateTagOf(bench)).toBe(0);
  });
});

describe("a presence sensor beyond the step", () => {
  it("goes back to 0 with its state on reset, and keeps the step count", async () => {
    const bench = open(sensing());
    await bench.write(SPAWN, 1);
    bench.step(1);
    expect(await stateTagOf(bench)).toBe(1);
    resetRuntimeState(bench.context, bench.openPantin);
    expect(await stateTagOf(bench)).toBe(0);
    expect(bench.openPantin.physicsState.presenceStates.size).toBe(0);
    expect(bench.openPantin.stepCount).toBe(1);
  });

  it("restores the world and applies nothing when the ray cast throws", async () => {
    const failing: PhysicsWorldFactory = (belts, guides) => {
      const world = testPhysicsWorldFactory(belts, guides);
      vi.spyOn(world, "castRays").mockImplementation(() => {
        throw new Error("cast failed");
      });
      return world;
    };
    const bench = open(sensing(), { physicsWorldFactory: failing });
    await bench.write(SPAWN, 1);
    expect(bench.step(1)).toBe(0);
    expect(bench.openPantin.stepCount).toBe(0);
    expect(bench.consoleCodes()).toContain("step_error");
    expect(bench.products()).toEqual([]);
    expect(bench.openPantin.physicsState.presenceStates.size).toBe(0);
  });
});
