import { JointAxisFromFaceResponseSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { expectPoint, useAlignmentBench } from "../test-support/alignment-bench.ts";
import { buildSampleGlb } from "../test-support/mesh-fixtures.ts";
import { importMesh, sendJsonRequest } from "../test-support/test-server.ts";

// Joint axis from a picked face (ADR 0041), through the API.

const { server } = useAlignmentBench();
const URL = "/api/pantins/bench/joints/slide/axis-from-face";

async function slideFromBaseToBlock(): Promise<void> {
  await sendJsonRequest(server(), "PUT", "/api/pantins/bench/assemblies/base/placement", {
    translation: [1, 0, 0],
    rotation: [0, 0, 0, 1],
  });
  const created = await sendJsonRequest(server(), "POST", "/api/pantins/bench/joints", {
    type: "prismatic",
    name: "Slide",
    parent: "base",
    child: "block",
    origin: [0, 0, 0],
    axis: [0, 0, 1],
    limits: [0, 0.5],
  });
  expect(created.status).toBe(201);
}

function pick(bodyId: string, faceIndex: number, hitPoint: number[]) {
  return sendJsonRequest(server(), "POST", URL, { bodyId, faceIndex, hitPoint });
}

describe("POST .../joints/:jointId/axis-from-face", () => {
  it("answers the cylinder axis in the frame of the parent assembly, storing nothing", async () => {
    await slideFromBaseToBlock();
    const before = await sendJsonRequest(server(), "GET", "/api/pantins/bench/joints", undefined);
    const onParent = await pick("base", 1, [1.3, 0.2, 0.05]);
    expect(onParent.status).toBe(200);
    const parent = JointAxisFromFaceResponseSchema.parse(onParent.json);
    expect(parent.axis).toEqual([0, 0, 1]);
    expectPoint(parent.origin, [0.3, 0.2, 0.05]);
    // A body of another assembly: its bore, expressed in the parent frame.
    const onOther = JointAxisFromFaceResponseSchema.parse(
      (await pick("block", 1, [0.01, 0, 0.1])).json,
    );
    expectPoint(onOther.origin, [-0.99, 0, 0.1]);
    const after = await sendJsonRequest(server(), "GET", "/api/pantins/bench/joints", undefined);
    expect(after.json).toEqual(before.json);
  });

  it("answers the outward normal of a plane", async () => {
    await slideFromBaseToBlock();
    const response = JointAxisFromFaceResponseSchema.parse(
      (await pick("base", 0, [1.3, 0.2, 0.3])).json,
    );
    expect(response.axis).toEqual([0, 0, 1]);
    expectPoint(response.origin, [0.3, 0.2, 0.1]);
  });

  it("refuses a body without face file, an unknown face, body or joint", async () => {
    await slideFromBaseToBlock();
    await importMesh(server(), "bench", "fileName=plain.glb", buildSampleGlb());
    expect((await pick("plain", 0, [0, 0, 0])).status).toBe(400);
    expect((await pick("base", 9, [0, 0, 0])).status).toBe(404);
    expect((await pick("nope", 0, [0, 0, 0])).status).toBe(404);
    const unknownJoint = await sendJsonRequest(
      server(),
      "POST",
      "/api/pantins/bench/joints/none/axis-from-face",
      { bodyId: "base", faceIndex: 0, hitPoint: [0, 0, 0] },
    );
    expect(unknownJoint.status).toBe(404);
    expect((await sendJsonRequest(server(), "POST", URL, { bodyId: "base" })).status).toBe(400);
  });
});
