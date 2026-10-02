import { AlignResponseSchema, PoseResponseSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { apply } from "../domain/rigid-transform.ts";
import {
  BASE_FACES,
  expectPoint,
  face,
  useAlignmentBench,
} from "../test-support/alignment-bench.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Alignment by picked faces (ADR 0035), through the API.

const { align, alignedPlacement, importWithFaces, server } = useAlignmentBench();

describe("POST .../assemblies/:assemblyKey/align", () => {
  it("mounts the block: plane on plane, then axis on axis, then about a pivot", async () => {
    // The block has no joint and identity body placement: its pose is its placement.
    const onPlane = await alignedPlacement({
      kind: "plane_on_plane",
      picks: [face("block", 0, [0.02, 0.01, 0]), face("base", 0, [0.3, 0.2, 0.1])],
    });
    expectPoint(onPlane.translation, [0, 0, 0.1]);

    const onAxis = await alignedPlacement({
      kind: "axis_on_axis",
      picks: [face("block", 1, [0.01, 0, 0.1]), face("base", 1, [0.3, 0.2, 0.1])],
    });
    expectPoint(apply(onAxis, [0.01, 0, 0]), [0.3, 0.2, 0.1]);

    const pivoted = await alignedPlacement({
      kind: "axis_around_pivot",
      picks: [
        face("base", 1, [0.3, 0.2, 0.1]),
        face("block", 2, [0.34, 0.2, 0.1]),
        face("base", 2, [0.3, 0.24, 0.1]),
      ],
    });
    // Both holes on both holes, the contact plane kept.
    expectPoint(apply(pivoted, [0.01, 0, 0]), [0.3, 0.2, 0.1]);
    expectPoint(apply(pivoted, [0.05, 0, 0]), [0.3, 0.24, 0.1]);
  });

  it("aligns to the plane of a triangle when the target body has no face file", async () => {
    const placement = await alignedPlacement({
      kind: "plane_on_plane",
      picks: [
        face("block", 0, [0, 0, 0]),
        { kind: "plane", body: "base", point: [1, 1, 0.25], normal: [0, 0, 2] },
      ],
      offset: 0.001,
    });
    expectPoint(placement.translation, [0, 0, 0.251]);
  });

  it("says the target is not displaced when no joint moves it", async () => {
    const response = await align({
      kind: "plane_on_plane",
      picks: [face("block", 0, [0, 0, 0]), face("base", 0, [0.3, 0.2, 0.1])],
    });
    expect(response.json).toMatchObject({ anchor: { kind: "world" }, targetDisplaced: false });
  });
});

describe("POST .../align on a target moved by a joint", () => {
  it("aligns to the target where it is displayed, and says it is displaced", async () => {
    await importWithFaces("carriage", BASE_FACES);
    const joint = await sendJsonRequest(server(), "POST", "/api/pantins/bench/joints", {
      type: "prismatic",
      name: "Slide",
      parent: "base",
      child: "carriage",
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 0.5],
    });
    expect(joint.json).toMatchObject({ joint: { id: "slide" } });
    await sendJsonRequest(server(), "PUT", "/api/pantins/bench/joints/slide/position", {
      position: 0.2,
    });
    const response = await align({
      kind: "axis_on_axis",
      picks: [face("block", 1, [0.01, 0, 0]), face("carriage", 1, [0.5, 0.2, 0])],
    });
    expect(response.json).toMatchObject({ targetDisplaced: true });
    const { placement } = AlignResponseSchema.parse(response.json);
    expectPoint(apply(placement, [0.01, 0, 0]), [0.5, 0.2, 0]);
  });
});

describe("POST .../align with anchored assemblies", () => {
  async function fixedJoint(parent: string, child: string): Promise<void> {
    const response = await sendJsonRequest(server(), "POST", "/api/pantins/bench/joints", {
      type: "fixed",
      name: `${parent} ${child}`,
      parent,
      child,
      origin: [0, 0, 0],
      axis: [0, 0, 1],
    });
    expect(response.status).toBe(201);
  }

  it("places an assembly anchored to another in its anchor's frame", async () => {
    await fixedJoint("base", "block");
    const response = await align({
      kind: "plane_on_plane",
      picks: [face("block", 0, [0, 0, 0]), face("base", 0, [0.3, 0.2, 0.1])],
    });
    expect(response.json).toMatchObject({ anchor: { kind: "assembly", key: "base" } });
    const pose = await sendRaw(server(), "GET", "/api/pantins/bench/pose");
    const block = PoseResponseSchema.parse(pose.json).bodies.find(
      ({ bodyId }) => bodyId === "block",
    );
    expectPoint(block?.translation ?? [Number.NaN, 0, 0], [0, 0, 0.1]);
  });

  it("refuses a target that hangs from the moving assembly", async () => {
    await importWithFaces("carriage", BASE_FACES);
    await fixedJoint("block", "carriage");
    const response = await align({
      kind: "plane_on_plane",
      picks: [face("block", 0, [0, 0, 0]), face("carriage", 0, [0.3, 0.2, 0.1])],
    });
    expect(response.status).toBe(409);
  });
});
