import {
  PantinResponseSchema,
  type ProductPose,
  SimulationClockStateSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import {
  BELT,
  type ConveyorServer,
  EMITTER,
  LINE,
  startConveyorServer,
} from "../test-support/conveyor-server.ts";
import { openSse, type SseClient } from "../test-support/sse-client.ts";

// Products in the pose response and the pose stream, the spawn tag, and the
// runtime reset (ADR 0043 point 12). The emitter has no belt under it, so its
// boxes fall: motion on a machine whose drives are all stopped.

const SPAWN = "frame.source.spawn";
const CELL = {
  name: "Cell",
  assembly: "frame",
  placement: EMITTER.placement,
  type: "photoelectric",
  mode: "diffuse",
  range: 0.6,
  normallyClosed: false,
  onDelay: 0,
  offDelay: 0,
};
const CELL_STATE = "frame.cell.state";
const BELOW = {
  name: "Sink",
  assembly: "frame",
  placement: { translation: [-0.35, 0, -0.6], rotation: [0, 0, 0, 1] },
  size: [0.4, 0.4, 0.4],
};

let line: ConveyorServer;

afterEach(async () => {
  await line.close();
});

async function spawnOne(): Promise<void> {
  await line.send("PUT", `${LINE}/tags/${SPAWN}`, { value: 1 });
  await line.send("PUT", `${LINE}/tags/${SPAWN}`, { value: 0 });
}

describe("products in the pose response", () => {
  beforeEach(async () => {
    line = await startConveyorServer();
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    await line.send("POST", `${LINE}/absorbers`, BELOW);
  });

  it("lists no product before any spawn", async () => {
    expect((await line.pose()).products).toEqual([]);
  });

  it("shows a spawn written through the tag route, then its fall, then its absorption", async () => {
    await spawnOne();
    await line.step(1);
    const [first] = (await line.pose()).products;
    expect(first).toMatchObject({
      productId: "p1",
      emitterId: "source",
      size: [0.1, 0.1, 0.1],
      material: "cardboard",
      rotation: [0, 0, 0, 1],
    });
    await line.step(5);
    const [later] = (await line.pose()).products;
    expect(later?.translation[2]).toBeLessThan(first?.translation[2] ?? Number.NaN);
    expect(later?.translation[0]).toBeCloseTo(-0.35, 6);
    // The box falls through the absorber at about 0.3 s (36 steps).
    await line.step(60);
    expect((await line.pose()).products).toEqual([]);
  });

  it("lists products in spawn order", async () => {
    await spawnOne();
    await line.step(1);
    await line.send("PATCH", `${LINE}/emitters/source`, {
      ...EMITTER,
      placement: { translation: [0.5, 0, 0], rotation: [0, 0, 0, 1] },
    });
    await spawnOne();
    await line.step(1);
    const products: ProductPose[] = (await line.pose()).products;
    expect(products.map(({ productId }) => productId)).toEqual(["p1", "p2"]);
  });
});

describe("products in the pose stream", () => {
  let client: SseClient;

  beforeEach(async () => {
    line = await startConveyorServer(false);
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    client = await openSse(line.server.address.port, `${LINE}/pose/stream`);
    await client.waitUntil(() => client.snapshots.length === 1);
  });

  afterEach(() => client.close());

  // A keep-alive travels on the socket of the snapshots: once it arrives, every
  // snapshot sent before it has arrived too.
  async function flush(): Promise<void> {
    const expected = client.comments.length + 1;
    line.timers.stream.advance(15);
    await client.waitUntil(() => client.comments.length >= expected);
  }

  it("sends a falling product on a stopped machine, one snapshot per period", async () => {
    await spawnOne();
    for (let step = 0; step < 8; step += 1) {
      line.timers.simulation.advance(STEP_SECONDS);
    }
    await client.waitUntil(() => client.snapshots.length === 3);
    const heights = client.snapshots
      .slice(1)
      .map((snapshot) => snapshot.products[0]?.translation[2]);
    expect(heights[0]).toBeGreaterThan(heights[1] ?? Number.NaN);
    expect(client.snapshots[1]?.jointPositions).toEqual(client.snapshots[2]?.jointPositions);
  });

  it("sends nothing once a box has settled on a stopped belt", async () => {
    await line.send("POST", `${LINE}/belts`, BELT);
    await spawnOne();
    // Settling takes well under 240 steps; the creep of a resting box (about
    // 1e-9 m per step, products never sleep) is below the sent precision.
    for (let step = 0; step < 240; step += 1) {
      line.timers.simulation.advance(STEP_SECONDS);
    }
    const settled = await line.pose();
    expect(settled.products).toHaveLength(1);
    await flush();
    const sentBefore = client.snapshots.length;
    for (let step = 0; step < 240; step += 1) {
      line.timers.simulation.advance(STEP_SECONDS);
    }
    await flush();
    expect(client.snapshots).toHaveLength(sentBefore);
    expect((await line.pose()).products).toEqual(settled.products);
  });

  it("sends nothing when no product moves", async () => {
    for (let step = 0; step < 8; step += 1) {
      line.timers.simulation.advance(STEP_SECONDS);
    }
    await flush();
    expect(client.snapshots).toHaveLength(1);
  });
});

describe("editing a belt", () => {
  it("rebuilds the physics world: the products go, and the console says so", async () => {
    line = await startConveyorServer();
    await line.send("POST", `${LINE}/belts`, BELT);
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    await spawnOne();
    await line.step(2);
    expect((await line.pose()).products).toHaveLength(1);
    await line.send("PATCH", `${LINE}/belts/feed-belt`, { ...BELT, length: 2 });
    expect((await line.pose()).products).toEqual([]);
    expect((await line.send("GET", `${LINE}/console`)).body).toContain("physics_rebuilt");
  });
});

describe("presence sensor edits", () => {
  // The cell sits where the box spawns: a ray that starts inside a box hits it.
  beforeEach(async () => {
    line = await startConveyorServer();
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    await line.send("POST", `${LINE}/presence-sensors`, CELL);
    await spawnOne();
    await line.step(1);
  });

  it("detects the box", async () => {
    expect((await line.tags())[CELL_STATE]).toBe(1);
  });

  it("forgets its output when replaced, until the next step", async () => {
    await line.send("PATCH", `${LINE}/presence-sensors/cell`, { ...CELL, range: 0.5 });
    expect((await line.tags())[CELL_STATE]).toBe(0);
    await line.step(1);
    expect((await line.tags())[CELL_STATE]).toBe(1);
  });

  it("forgets its output when deleted: a cell made later under the same id starts at 0", async () => {
    await line.send("DELETE", `${LINE}/presence-sensors/cell`);
    await line.send("POST", `${LINE}/presence-sensors`, CELL);
    expect((await line.tags())[CELL_STATE]).toBe(0);
  });
});

describe("deleting an emitter", () => {
  it("leaves its products in the pose, drawable by their own size", async () => {
    line = await startConveyorServer();
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    await spawnOne();
    await line.step(1);
    await line.send("DELETE", `${LINE}/emitters/source`);
    expect((await line.pose()).products).toMatchObject([
      { productId: "p1", emitterId: "source", size: [0.1, 0.1, 0.1] },
    ]);
  });

  it("forgets its latched spawn: an emitter made later under the same id starts clean", async () => {
    line = await startConveyorServer();
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    await line.send("PUT", `${LINE}/tags/${SPAWN}`, { value: 1 });
    await line.send("DELETE", `${LINE}/emitters/source`);
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    await line.step(1);
    expect((await line.pose()).products).toEqual([]);
    expect((await line.tags())[SPAWN]).toBe(0);
    await spawnOne();
    await line.step(1);
    expect((await line.pose()).products).toHaveLength(1);
  });
});

describe("POST reset", () => {
  beforeEach(async () => {
    line = await startConveyorServer();
    await line.send("POST", `${LINE}/belts`, BELT);
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    await spawnOne();
    await line.step(10);
    await line.send("PUT", `${LINE}/tags/frame.drum.setpoint`, { value: 1 });
  });

  it("clears the products and keeps unsaved edits, the clock and the step count", async () => {
    expect((await line.pose()).products).toHaveLength(1);
    const before = SimulationClockStateSchema.parse((await line.send("GET", `${LINE}/clock`)).json);
    const reset = await line.send("POST", `${LINE}/reset`);
    expect(reset.status).toBe(200);
    const pantin = PantinResponseSchema.parse(reset.json);
    expect(pantin.unsavedChanges).toBe(true);
    expect(pantin.document.belts).toHaveLength(1);
    expect(pantin.document.emitters).toHaveLength(1);
    expect((await line.pose()).products).toEqual([]);
    const after = SimulationClockStateSchema.parse((await line.send("GET", `${LINE}/clock`)).json);
    expect(after.step).toBe(before.step);
  });

  it("lets the same scene replay: the next spawn is p1 again, from a spawn tag at 0", async () => {
    await line.send("POST", `${LINE}/reset`);
    expect((await line.tags())[SPAWN]).toBe(0);
    await spawnOne();
    await line.step(1);
    expect((await line.pose()).products.map(({ productId }) => productId)).toEqual(["p1"]);
  });

  it("sends the cleared pose to the stream at once, with the clock paused", async () => {
    const client = await openSse(line.server.address.port, `${LINE}/pose/stream`);
    try {
      await client.waitUntil(() => client.snapshots.length === 1);
      expect(client.snapshots[0]?.products).toHaveLength(1);
      await line.send("POST", `${LINE}/reset`);
      await client.waitUntil(() => client.snapshots.length === 2);
      expect(client.snapshots[1]?.products).toEqual([]);
    } finally {
      client.close();
    }
  });

  it("answers 404 for an unknown Pantin", async () => {
    expect((await line.send("POST", "/api/pantins/ghost/reset")).status).toBe(404);
  });
});
