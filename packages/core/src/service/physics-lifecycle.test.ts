import type { PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { belt, conveyorLine, emitter } from "../test-support/conveyor-fixtures.ts";
import { type Bench, benchesClosedAfterEach } from "../test-support/physics-bench.ts";
import { resetRuntimeState } from "./open-pantins.ts";
import { listTags } from "./tag-operations.ts";

// The spawn latch, the console events, reset, rebuild and the world lifecycle
// of an open Pantin (ADR 0043 points 5, 10 and 11).

const open = benchesClosedAfterEach();

const RUN = "main.contactor.run";
const SPAWN = "main.source.spawn";

async function spawnsFrom(writes: readonly (readonly [number, number])[]): Promise<number> {
  const bench = open(conveyorLine());
  await bench.write(RUN, 1);
  for (const [value, steps] of writes) {
    await bench.write(SPAWN, value);
    bench.step(steps);
  }
  return bench.openPantin.physicsState.nextProductNumber - 1;
}

describe("the spawn tag of an emitter", () => {
  it("spawns once for a 1 then a 0 written between two steps", async () => {
    const bench = open(conveyorLine());
    await bench.write(SPAWN, 1);
    await bench.write(SPAWN, 0);
    bench.step(1);
    expect(bench.products().map(({ id }) => id)).toEqual(["p1"]);
  });

  it("spawns once while a PLC holds the bit at 1", async () => {
    expect(await spawnsFrom([[1, 200]])).toBe(1);
  });

  it("spawns once for each rising edge: 0, 1, 0, 1 gives two", async () => {
    // 30 steps clear a 0.1 m box off the emitter at 0.5 m/s.
    expect(
      await spawnsFrom([
        [0, 1],
        [1, 40],
        [0, 1],
        [1, 40],
      ]),
    ).toBe(2);
  });

  it("does nothing when the same value is written again", async () => {
    const bench = open(conveyorLine());
    await bench.write(SPAWN, 1);
    bench.step(40);
    await bench.write(SPAWN, 1);
    expect(bench.openPantin.physicsState.queuedSpawns).toEqual([]);
  });

  it("reads back the last value written when the tags are listed", async () => {
    const bench = open(conveyorLine());
    const spawnValue = async () =>
      (await listTags(bench.context, "line")).tags.find(({ name }) => name === SPAWN)?.value;
    expect(await spawnValue()).toBe(0);
    await bench.write(SPAWN, 1);
    bench.step(5);
    expect(await spawnValue()).toBe(1);
    await bench.write(SPAWN, 0);
    expect(await spawnValue()).toBe(0);
  });

  it("serves two latched pulses of one step in turn: the second finds the spot taken", async () => {
    const bench = open(conveyorLine());
    for (const value of [1, 0, 1]) {
      await bench.write(SPAWN, value);
    }
    bench.step(1);
    expect(bench.products()).toHaveLength(1);
    expect(bench.consoleCodes()).toEqual(["emitter_blocked"]);
  });
});

describe("a spawn that does not happen", () => {
  it("reports emitter_blocked when the box would overlap a product", async () => {
    const bench = open(conveyorLine());
    await bench.write(SPAWN, 1);
    bench.step(2);
    await bench.write(SPAWN, 0);
    await bench.write(SPAWN, 1);
    bench.step(1);
    expect(bench.products()).toHaveLength(1);
    expect(bench.consoleCodes()).toEqual(["emitter_blocked"]);
    expect(bench.openPantin.console.entries[0]?.params).toEqual({ emitter: "source" });
  });

  it("reports product_limit when the Pantin already holds the cap", async () => {
    const bench = open(conveyorLine(), { productLimit: 1 });
    await bench.write(SPAWN, 1);
    bench.step(2);
    await bench.write(SPAWN, 0);
    await bench.write(SPAWN, 1);
    bench.step(1);
    expect(bench.products()).toHaveLength(1);
    expect(bench.consoleCodes()).toEqual(["product_limit"]);
  });
});

describe("reset", () => {
  it("clears products and latched spawns, numbers from p1, and keeps the step count", async () => {
    const bench = open(conveyorLine({ emitters: [emitter(), emitter({ id: "b", tagKey: "b" })] }));
    await bench.write(SPAWN, 1);
    bench.step(30);
    await bench.write("main.b.spawn", 1);
    expect(bench.products().length).toBeGreaterThan(0);
    resetRuntimeState(bench.context, bench.openPantin);
    expect(bench.openPantin.physicsState).toMatchObject({
      products: [],
      queuedSpawns: [],
      nextProductNumber: 1,
    });
    expect(bench.openPantin.physicsState.spawnValues.size).toBe(0);
    expect(bench.openPantin.stepCount).toBe(30);
    // The world is empty again and spawns again from p1.
    await bench.write(SPAWN, 1);
    bench.step(1);
    expect(bench.products().map(({ id }) => id)).toEqual(["p1"]);
  });
});

async function benchWithProduct(belts = [belt()]) {
  const bench = open(conveyorLine({ belts }));
  await bench.write(SPAWN, 1);
  bench.step(30);
  return bench;
}

function rebuiltBy(
  bench: Bench,
  edit: (document: PantinDocument) => Partial<PantinDocument>,
): void {
  bench.openPantin.document = {
    ...bench.openPantin.document,
    ...edit(bench.openPantin.document),
  };
  bench.step(1);
  expect(bench.products()).toHaveLength(0);
  expect(bench.consoleCodes()).toEqual(["physics_rebuilt"]);
}

describe("a change of belts or guides", () => {
  it("rebuilds the world, clears the products and says so", async () => {
    const bench = open(conveyorLine());
    await bench.write(SPAWN, 1);
    bench.step(30);
    bench.openPantin.document = { ...bench.openPantin.document, belts: [belt({ length: 2 })] };
    bench.step(1);
    expect(bench.products()).toHaveLength(0);
    expect(bench.consoleCodes()).toEqual(["physics_rebuilt"]);
    expect(bench.openPantin.console.entries[0]?.params).toEqual({ products: 1 });
  });

  it("stays silent when there was no product to clear", () => {
    const bench = open(conveyorLine());
    bench.openPantin.document = { ...bench.openPantin.document, belts: [belt({ length: 2 })] };
    bench.step(1);
    expect(bench.consoleCodes()).toEqual([]);
  });
});

describe("an edit of where a belt or guide sits", () => {
  it("is triggered by a placement edit of the belt", async () => {
    const bench = await benchWithProduct();
    const moved = belt({ placement: { translation: [0, 0.1, 0], rotation: [0, 0, 0, 1] } });
    rebuiltBy(bench, () => ({ belts: [moved] }));
  });

  it("is triggered by an assembly placement edit", async () => {
    const bench = await benchWithProduct();
    rebuiltBy(bench, (document) => ({
      assemblies: document.assemblies.map((assembly) =>
        assembly.key === "main"
          ? { ...assembly, placement: { translation: [0, 0, 0.3], rotation: [0, 0, 0, 1] } }
          : assembly,
      ),
    }));
  });

  it("is triggered by the placement of the body a belt follows", async () => {
    const bench = await benchWithProduct([belt({ body: "roller" })]);
    rebuiltBy(bench, (document) => ({
      bodies: document.bodies.map((body) =>
        body.id === "roller"
          ? { ...body, placement: { translation: [0.2, 0, 0], rotation: [0, 0, 0, 1] } }
          : body,
      ),
    }));
  });

  it("is not triggered by joint motion during a run", async () => {
    const bench = open(conveyorLine({ belts: [belt({ body: "roller" })] }));
    await bench.write(RUN, 1);
    await bench.write(SPAWN, 1);
    bench.step(30);
    expect(bench.openPantin.jointPositions.get("drum")).not.toBe(0);
    expect(bench.consoleCodes()).not.toContain("physics_rebuilt");
    expect(bench.products()).toHaveLength(1);
  });

  it("is not triggered by an unrelated document edit", async () => {
    const bench = await benchWithProduct();
    bench.openPantin.document = { ...bench.openPantin.document, name: "Renamed" };
    bench.step(1);
    expect(bench.products()).toHaveLength(1);
  });
});
