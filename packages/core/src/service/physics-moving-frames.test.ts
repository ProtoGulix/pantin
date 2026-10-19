import type { Placement } from "@pantin/protocol";
import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { belt, emitter, guide } from "../test-support/conveyor-fixtures.ts";
import { type Bench, benchesClosedAfterEach } from "../test-support/physics-bench.ts";
import { assembly, body, documentOf, joint } from "../test-support/placed-fixtures.ts";
import { toPoseSnapshot } from "./joint-operations.ts";

// Belts and guides on an assembly that a lift carries (ADR 0043 points 1, 4 and
// 10), with the real physics engine: the objects have no `body`, so they sit in
// the assembly frame as posed, which the prismatic "lift" moves up. The poses
// are read from the pose response (toPoseSnapshot).

const open = benchesClosedAfterEach();

const AT_ORIGIN: Placement = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const AT_SIDE: Placement = { translation: [0, 0.25, 0], rotation: [0, 0, 0, 1] };
const ON_BELT: Placement = { translation: [0, 0, 0.001], rotation: [0, 0, 0, 1] };
const LIFT_STROKE = 0.3;
const SPAWN = "carrier.source.spawn";

function liftLine() {
  return documentOf(
    [
      joint({
        id: "lift",
        type: "prismatic",
        parent: bodyEndpoint("base"),
        child: groupEndpoint("carrier"),
        origin: [0, 0, 0],
        axis: [0, 0, 1],
        limits: [0, 0.5],
      }),
      joint({
        id: "drum",
        type: "continuous",
        parent: bodyEndpoint("deck"),
        child: bodyEndpoint("roller"),
        origin: [0, 0, 0],
        axis: [0, 1, 0],
      }),
    ],
    [body("base", "frame"), body("deck", "carrier"), body("roller", "carrier")],
    [assembly("frame", AT_ORIGIN), assembly("carrier", AT_ORIGIN)],
    {
      belts: [belt({ assembly: "carrier", placement: AT_ORIGIN })],
      guides: [guide({ assembly: "carrier", placement: AT_SIDE, size: [1, 0.02, 0.1] })],
      emitters: [emitter({ assembly: "carrier", placement: ON_BELT })],
    },
  );
}

function objectHeights(bench: Bench): Record<string, number> {
  return Object.fromEntries(
    toPoseSnapshot(bench.openPantin).objects.map(({ id, translation }) => [id, translation[2]]),
  );
}

// A step at a time: a belt that jumped would go through the box instead of lifting it.
function raiseLift(bench: Bench, stroke: number, steps: number): void {
  for (let step = 1; step <= steps; step += 1) {
    bench.openPantin.jointPositions.set("lift", (stroke * step) / steps);
    bench.step(1);
  }
}

describe("a lift carrying a belt, a guide and a box", () => {
  it("moves the belt and the guide poses with the lift", () => {
    const bench = open(liftLine());
    expect(objectHeights(bench)).toMatchObject({ feed: 0, rail: 0 });
    raiseLift(bench, LIFT_STROKE, 120);
    const heights = objectHeights(bench);
    expect(heights.feed).toBeCloseTo(LIFT_STROKE, 9);
    expect(heights.rail).toBeCloseTo(LIFT_STROKE, 9);
  });

  it("raises a box resting on the belt with it", async () => {
    const bench = open(liftLine());
    await bench.write(SPAWN, 1);
    bench.step(60);
    const rested = bench.products()[0]?.pose.translation[2] ?? Number.NaN;
    expect(rested).toBeGreaterThan(0);
    expect(rested).toBeLessThan(0.1);
    raiseLift(bench, LIFT_STROKE, 120);
    bench.step(30);
    const raised = (bench.products()[0]?.pose.translation[2] ?? Number.NaN) - rested;
    // Sanity bound, not exact: the contact solver may sink or bounce the box a little.
    expect(raised).toBeGreaterThan(LIFT_STROKE * 0.8);
    expect(raised).toBeLessThan(LIFT_STROKE * 1.2);
  });
});
