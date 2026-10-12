import { createHash } from "node:crypto";
import type { Placement } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { describeTags } from "../domain/tags.ts";
import { conveyorLine, endAbsorber, photoelectricCell } from "../test-support/conveyor-fixtures.ts";
import { type Bench, benchesClosedAfterEach } from "../test-support/physics-bench.ts";

// Phase 6 exit criterion (CLAUDE.md 13.6, ADR 0043 point 15 P2): a carton
// crosses a conveyor, a presence sensor detects it, reproducibly. No viewer,
// the real physics engine, a paused clock and runSteps, the service function
// behind the step route of ADR 0032 point 3.
//
// The line (test-support/conveyor-fixtures.ts): a 1 m belt from x = -0.5 to
// 0.5 at 0.5 m/s (10 rad/s × 0.05 m), a 0.1 m cube spawned centred at x = -0.35
// (belt start + 0.15 m), a diffuse cell 0.6 m from the belt start (x = 0.1)
// looking across the belt, an absorber on the last 0.1 m.

const RUN = "main.contactor.run";
const SPAWN = "main.source.spawn";
const CELL = "main.cell.state";
const MAX_STEPS = 400;

// The beam must run along +Y, across the belt: turn the frame -90° about X
// (Z becomes Y). It starts 0.3 m to the side, at mid-height of the carton.
const SIDE_QUARTER_TURN = Math.SQRT1_2;
const CROSS_BELT: Placement = {
  translation: [0.1, -0.3, 0.05],
  rotation: [-SIDE_QUARTER_TURN, 0, 0, SIDE_QUARTER_TURN],
};

function cartonLine() {
  return conveyorLine({
    absorbers: [endAbsorber()],
    presenceSensors: [photoelectricCell({ placement: CROSS_BELT, range: 0.6 })],
  });
}

type Run = { edges: { step: number; value: number }[]; digest: string; remaining: number };

async function runLine(open: (document: ReturnType<typeof cartonLine>) => Bench): Promise<Run> {
  const bench = open(cartonLine());
  const hash = createHash("sha256");
  const edges: Run["edges"] = [];
  let last = 0;
  await bench.write(RUN, 1);
  await bench.write(SPAWN, 1);
  await bench.write(SPAWN, 0);
  let carton = false;
  for (let step = 0; step < MAX_STEPS && !(carton && bench.products().length === 0); step += 1) {
    bench.step(1);
    carton ||= bench.products().length > 0;
    const tags = describeTags(bench.openPantin.document, bench.openPantin);
    const value = tags.find((tag) => tag.name === CELL)?.value ?? Number.NaN;
    if (value !== last) {
      edges.push({ step: bench.openPantin.stepCount, value });
      last = value;
    }
    hash.update(JSON.stringify([bench.products().map(({ id, pose }) => [id, pose]), tags]));
  }
  return { edges, digest: hash.digest("hex"), remaining: bench.products().length };
}

describe("phase 6 exit criterion: a carton crosses the conveyor and the cell sees it", () => {
  const open = benchesClosedAfterEach();

  it("switches the cell on, then off, once, at the expected times, then the absorber clears the line", async () => {
    const run = await runLine(open);
    expect(run.edges.map(({ value }) => value)).toEqual([1, 0]);
    const [on, off] = run.edges.map(({ step }) => step);
    // Hand computation. The front face (centre + 0.05) reaches the beam at
    // x = 0.1 when the centre has travelled 0.40 m: 0.8 s = 96 steps at
    // 0.5 m/s, plus the step that serves the spawn pulse, 97. The carton is put
    // on the belt at rest and friction (0.5, g = 9.81) takes 0.5 / 4.9 = 0.102 s
    // to bring it to belt speed, losing 0.5 × 0.102 / 2 = 0.0255 m, 0.051 s,
    // about 6 steps: 103. Measured: on at step 102, off at step 126 (the back
    // face leaves the beam after 0.50 m of travel; 0.1 m of box in the beam
    // is 0.2 s, 24 steps).
    expect(on).toBeGreaterThanOrEqual(99);
    expect(on).toBeLessThanOrEqual(105);
    expect((off ?? 0) - (on ?? 0)).toBeGreaterThanOrEqual(23);
    expect((off ?? 0) - (on ?? 0)).toBeLessThanOrEqual(25);
    expect(run.remaining).toBe(0);
  });

  it("gives the same on and off steps and the same digest on two fresh Pantins", async () => {
    const first = await runLine(open);
    const second = await runLine(open);
    expect(second.edges).toEqual(first.edges);
    expect(first.edges).toHaveLength(2);
    expect(second.digest).toBe(first.digest);
  });
});
