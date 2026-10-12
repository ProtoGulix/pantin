import { beforeEach, describe, expect, it } from "vitest";
import { conveyorLine, emitter, endAbsorber } from "../test-support/conveyor-fixtures.ts";
import { type Bench, benchesClosedAfterEach } from "../test-support/physics-bench.ts";

// A box carried by a belt through the service (ADR 0043 points 3, 4, 6 and 10),
// with the real physics engine: contactor, ac_motor, continuous drum, belt.

const open = benchesClosedAfterEach();

const RUN = "main.contactor.run";
const SPAWN = "main.source.spawn";

async function spawnOne(bench: Bench): Promise<void> {
  await bench.write(SPAWN, 1);
  await bench.write(SPAWN, 0);
}

function boxX(bench: Bench): number {
  return bench.products()[0]?.pose.translation[0] ?? Number.NaN;
}

describe("a box on a running belt", () => {
  let bench: Bench;
  beforeEach(async () => {
    bench = open(conveyorLine());
    await bench.write(RUN, 1);
    await spawnOne(bench);
  });

  it("is carried along +X at drum velocity times radius", () => {
    bench.step(120);
    const before = boxX(bench);
    bench.step(120);
    // One second at 10 rad/s × 0.05 m = 0.5 m/s.
    expect(boxX(bench) - before).toBeCloseTo(0.5, 2);
  });

  it("stays where it is when the contactor is open", async () => {
    await bench.write(RUN, 0);
    bench.step(120);
    const before = boxX(bench);
    bench.step(120);
    expect(boxX(bench)).toBeCloseTo(before, 3);
  });

  it("does not move on a jammed drum", () => {
    bench.openPantin.jammedJointIds.add("drum");
    bench.step(60);
    const before = boxX(bench);
    bench.step(120);
    expect(boxX(bench)).toBeCloseTo(before, 3);
  });
});

describe("a belt whose drum no actuator moves", () => {
  it("does not carry the box, whatever the drum setpoint", async () => {
    const bench = open(conveyorLine({ drives: [], actuators: [] }));
    await bench.write("main.drum.setpoint", 5);
    await bench.write(SPAWN, 1);
    bench.step(60);
    const before = boxX(bench);
    bench.step(120);
    expect(boxX(bench)).toBeCloseTo(before, 3);
  });
});

describe("the end of the belt", () => {
  it("is where an absorber removes the box", async () => {
    const bench = open(conveyorLine({ absorbers: [endAbsorber()] }));
    await bench.write(RUN, 1);
    await spawnOne(bench);
    bench.step(100);
    expect(bench.products()).toHaveLength(1);
    // 0.7 m to the absorber centre at 0.5 m/s: about 170 steps in all.
    bench.step(160);
    expect(bench.products()).toHaveLength(0);
  });

  it("drops a box off the belt and kills it below the kill plane", async () => {
    const bench = open(conveyorLine());
    await bench.write(RUN, 1);
    await spawnOne(bench);
    bench.step(260);
    const falling = bench.products()[0]?.pose.translation[2] ?? 0;
    expect(falling).toBeLessThan(-0.1);
    expect(bench.products()).toHaveLength(1);
    // Free fall to 10 m takes 1.43 s, 172 steps.
    bench.step(260);
    expect(bench.products()).toHaveLength(0);
  });
});

describe("a scene without belt or guide", () => {
  it("still has a world: the product falls and the kill plane removes it", async () => {
    const bench = open(conveyorLine({ belts: [], emitters: [emitter()] }));
    await bench.write(SPAWN, 1);
    bench.step(10);
    expect(bench.products()).toHaveLength(1);
    bench.step(200);
    expect(bench.products()).toHaveLength(0);
  });
});

describe("two runs from fresh Pantins", () => {
  async function trace(): Promise<string[]> {
    const bench = open(conveyorLine({ absorbers: [endAbsorber()] }));
    await bench.write(RUN, 1);
    const poses: string[] = [];
    for (let step = 0; step < 400; step += 1) {
      if (step % 100 === 0) {
        await spawnOne(bench);
      }
      bench.step(1);
      poses.push(JSON.stringify(bench.products().map(({ id, pose }) => [id, pose])));
    }
    return poses;
  }

  it("give the same product poses, bit for bit, at every step", async () => {
    const first = await trace();
    const second = await trace();
    expect(first.some((line) => line !== "[]")).toBe(true);
    expect(second).toEqual(first);
  });
});
