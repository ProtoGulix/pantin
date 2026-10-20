import type { PantinDocument, Placement } from "@pantin/protocol";
import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { belt, emitter } from "../test-support/conveyor-fixtures.ts";
import { type Bench, benchesClosedAfterEach } from "../test-support/physics-bench.ts";
import { assembly, body, documentOf, joint } from "../test-support/placed-fixtures.ts";

// A belt carried sideways by a shuttle (ADR 0043 point 3), with the real
// physics engine: the shuttle slides along +Y, the belt runs along +X, so a box
// on it has to follow the shuttle and, with the drum turning, be conveyed too.

const open = benchesClosedAfterEach();

const AT_ORIGIN: Placement = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const ON_BELT: Placement = { translation: [-0.3, 0, 0.001], rotation: [0, 0, 0, 1] };
const SHUTTLE_STROKE = 0.3;
const SHUTTLE_STEPS = 120;
const SPAWN = "carrier.source.spawn";
const RUN = "carrier.contactor.run";

const SHUTTLE_JOINTS = [
  joint({
    id: "shuttle",
    type: "prismatic",
    parent: bodyEndpoint("base"),
    child: groupEndpoint("carrier"),
    origin: [0, 0, 0],
    axis: [0, 1, 0],
    limits: [0, 0.5],
  }),
  joint({
    id: "drum",
    tagKey: "drum",
    type: "continuous",
    parent: bodyEndpoint("deck"),
    child: bodyEndpoint("roller"),
    origin: [0, 0, 0],
    axis: [0, 1, 0],
  }),
];

// contactor, then an `ac_motor` of 10 rad/s on the drum: 0.5 m/s at the surface.
const DRIVEN_DRUM: Partial<PantinDocument> = {
  drives: [
    {
      id: "contactor",
      tagKey: "contactor",
      name: "Contactor",
      assembly: "carrier",
      type: "contactor",
    },
  ],
  actuators: [
    {
      id: "motor",
      name: "Motor",
      assembly: "carrier",
      type: "ac_motor",
      nominalSpeed: 10,
      feed: { drive: "contactor", ports: { in: "out" } },
      joints: ["drum"],
    },
  ],
};

function shuttleLine(): PantinDocument {
  return documentOf(
    SHUTTLE_JOINTS,
    [body("base", "frame"), body("deck", "carrier"), body("roller", "carrier")],
    [assembly("frame", AT_ORIGIN), assembly("carrier", AT_ORIGIN)],
    {
      belts: [belt({ assembly: "carrier", placement: AT_ORIGIN })],
      emitters: [
        emitter({
          assembly: "carrier",
          placement: ON_BELT,
          box: { size: [0.1, 0.1, 0.1], mass: 1, material: "cardboard" },
        }),
      ],
      ...DRIVEN_DRUM,
    },
  );
}

// A step at a time, so the belt travels with the shuttle instead of jumping.
function slideShuttle(bench: Bench): void {
  for (let step = 1; step <= SHUTTLE_STEPS; step += 1) {
    bench.openPantin.jointPositions.set("shuttle", (SHUTTLE_STROKE * step) / SHUTTLE_STEPS);
    bench.step(1);
  }
}

async function boxAtRest(bench: Bench): Promise<readonly [number, number, number]> {
  await bench.write(SPAWN, 1);
  bench.step(60);
  return bench.products()[0]?.pose.translation ?? [Number.NaN, Number.NaN, Number.NaN];
}

describe("a shuttle carrying a belt and a box sideways", () => {
  it("carries a box on a stopped belt along with the shuttle", async () => {
    const bench = open(shuttleLine());
    const [startX, startY] = await boxAtRest(bench);
    slideShuttle(bench);
    const [endX, endY] = bench.products()[0]?.pose.translation ?? [Number.NaN, Number.NaN];
    // Sanity bounds, not exact: the contact solver may let the box slip a little.
    expect(endY - startY).toBeGreaterThan(SHUTTLE_STROKE * 0.9);
    expect(endY - startY).toBeLessThan(SHUTTLE_STROKE * 1.1);
    expect(Math.abs(endX - startX)).toBeLessThan(0.02);
  });

  it("still conveys the box along the belt while the shuttle moves", async () => {
    const bench = open(shuttleLine());
    const [startX, startY] = await boxAtRest(bench);
    await bench.write(RUN, 1);
    slideShuttle(bench);
    const [endX, endY] = bench.products()[0]?.pose.translation ?? [Number.NaN, Number.NaN];
    // 10 rad/s on a 0.05 m drum is 0.5 m/s, for about 1 s.
    expect(endX - startX).toBeGreaterThan(0.3);
    expect(endY - startY).toBeGreaterThan(SHUTTLE_STROKE * 0.9);
    expect(endY - startY).toBeLessThan(SHUTTLE_STROKE * 1.1);
  });

  it("gives bit-identical box poses on two identical runs", async () => {
    const run = async () => {
      const bench = open(shuttleLine());
      await boxAtRest(bench);
      await bench.write(RUN, 1);
      slideShuttle(bench);
      return bench.products().map(({ pose }) => pose);
    };
    expect(await run()).toEqual(await run());
  });
});
