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

// The world pose of every phase 6 object in the pose response and stream
// (ADR 0043 point 12), with the frame rule of the physics step: an object on a
// body rides with it; an object on an assembly stays at the assembly's static
// world frame, even when a joint that anchors the assembly has moved.

const SHIFT = { translation: [0.1, 0.2, 0.3], rotation: [0, 0, 0, 1] };
let line: ConveyorServer;

afterEach(async () => {
  await line.close();
});

async function moveDrum(position: number): Promise<void> {
  await line.send("PUT", `${LINE}/joints/drum/position`, { position });
}

describe("objects in the pose response", () => {
  beforeEach(async () => {
    line = await startConveyorServer();
    await line.send("POST", `${LINE}/belts`, { ...BELT, placement: SHIFT });
    await line.send("POST", `${LINE}/emitters`, EMITTER);
    await line.send("POST", `${LINE}/guides`, {
      name: "Guide",
      assembly: "roller",
      body: "roller",
      placement: SHIFT,
      size: [0.5, 0.02, 0.1],
    });
  });

  it("lists none on a line without objects", async () => {
    const empty = await startConveyorServer();
    try {
      expect((await empty.pose()).objects).toEqual([]);
    } finally {
      await empty.close();
    }
  });

  it("lists every object with its kind and id, belts first", async () => {
    const { objects } = await line.pose();
    expect(objects.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      "belt:feed-belt",
      "guide:guide",
      "emitter:source",
    ]);
  });

  it("puts an object on an assembly at the assembly's frame composed with its placement", async () => {
    const belt = (await line.pose()).objects[0];
    expect(belt?.translation).toEqual([0.1, 0.2, 0.3]);
    expect(belt?.rotation).toEqual([0, 0, 0, 1]);
  });

  it("makes an object on a body ride with it, and leaves an assembly-framed one static", async () => {
    await moveDrum(Math.PI / 2);
    const { objects, bodies } = await line.pose();
    const roller = bodies.find((body) => body.bodyId === "roller");
    expect(roller?.rotation[1]).toBeCloseTo(Math.SQRT1_2, 6);
    const guide = objects.find((object) => object.kind === "guide");
    // Turned 90 degrees about Y with the body, then the placement on top.
    expect(guide?.rotation[1]).toBeCloseTo(Math.SQRT1_2, 6);
    const emitter = objects.find((object) => object.kind === "emitter");
    expect(emitter?.translation).toEqual([-0.35, 0, 0]);
    // The belt is on the "frame" assembly, which no joint anchors.
    expect(objects.find((object) => object.kind === "belt")?.translation).toEqual([0.1, 0.2, 0.3]);
  });
});

describe("objects on an assembly anchored by a moved joint", () => {
  it("stay at the static world frame, as the physics step places them", async () => {
    line = await startConveyorServer();
    await line.send("POST", `${LINE}/guides`, {
      name: "Guide",
      assembly: "roller",
      placement: SHIFT,
      size: [0.5, 0.02, 0.1],
    });
    const before = (await line.pose()).objects[0];
    await moveDrum(1);
    const after = (await line.pose()).objects[0];
    expect(after).toEqual(before);
  });
});

describe("objects in the pose stream", () => {
  let client: SseClient;

  beforeEach(async () => {
    line = await startConveyorServer(false);
    await line.send("POST", `${LINE}/belts`, BELT);
    client = await openSse(line.server.address.port, `${LINE}/pose/stream`);
    await client.waitUntil(() => client.snapshots.length === 1);
  });

  afterEach(() => client.close());

  it("carries the objects, and sends nothing more while a static line runs", async () => {
    expect(client.snapshots[0]?.objects).toHaveLength(1);
    for (let step = 0; step < 40; step += 1) {
      line.timers.simulation.advance(STEP_SECONDS);
    }
    const expected = client.comments.length + 1;
    line.timers.stream.advance(15);
    await client.waitUntil(() => client.comments.length >= expected);
    expect(client.snapshots).toHaveLength(1);
  });
});
