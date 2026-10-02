import {
  AssemblyPlacementResponseSchema,
  JointResponseSchema,
  PoseResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

// PUT .../assemblies/:key/placement (ADR 0033 points 8 and 9). Each STL
// import is its own assembly: "rail" and "carriage", the carriage hung from
// the rail by a prismatic joint, so the rail is world-anchored and the
// carriage is anchored to the rail.

let workspace: TestWorkspace;
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory);
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "axis", "fileName=carriage.stl&unit=mm", buildAsciiStl());
  const joint = await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", {
    type: "prismatic",
    name: "Axe X",
    parent: "rail",
    child: "carriage",
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.8],
  });
  JointResponseSchema.parse(joint.json);
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

const SIDEWAYS = { translation: [0, 0.5, 0], rotation: [0, 0, 0, 1] };

function place(key: string, body: unknown) {
  return sendJsonRequest(server, "PUT", `/api/pantins/axis/assemblies/${key}/placement`, body);
}

async function poseOf(bodyId: string) {
  const response = await sendRaw(server, "GET", "/api/pantins/axis/pose");
  return PoseResponseSchema.parse(response.json).bodies.find((body) => body.bodyId === bodyId);
}

// JSON.stringify cannot write 1e999, which parses as Infinity.
it("answers 400 for a coordinate beyond the double range", async () => {
  const text = '{"translation":[1e999,0,0],"rotation":[0,0,0,1]}';
  const bytes = new TextEncoder().encode(text);
  const path = "/api/pantins/axis/assemblies/rail/placement";
  const response = await sendRaw(server, "PUT", path, { contentType: "application/json", bytes });
  expect(response.status).toBe(400);
});

describe("placing an assembly", () => {
  it("stores the placement, answers the world anchor and moves the bodies", async () => {
    await sendJsonRequest(server, "PUT", "/api/pantins/axis/joints/axe-x/position", {
      position: 0.3,
    });
    const response = await place("rail", SIDEWAYS);
    expect(response.status).toBe(200);
    expect(AssemblyPlacementResponseSchema.parse(response.json)).toEqual({
      placement: SIDEWAYS,
      anchor: { kind: "world" },
    });
    expect((await poseOf("rail"))?.translation).toEqual([0, 0.5, 0]);
    // The joint position is kept, and the anchored carriage follows the rail.
    const carriage = (await poseOf("carriage"))?.translation ?? [];
    expect(carriage[0]).toBeCloseTo(0.3, 12);
    expect(carriage[1]).toBeCloseTo(0.5, 12);
    const pantin = await sendRaw(server, "GET", "/api/pantins/axis");
    expect(JSON.stringify(pantin.json)).toContain('"placement"');
  });

  it("carries the anchored carriage along a rotated placement of the rail", async () => {
    await sendJsonRequest(server, "PUT", "/api/pantins/axis/joints/axe-x/position", {
      position: 0.3,
    });
    const sine = Math.SQRT1_2;
    await place("rail", { translation: [1, 2, 0], rotation: [0, 0, sine, sine] });
    // 0.3 m along the rail's x axis, turned a quarter about z, is 0.3 m along y.
    const carriage = (await poseOf("carriage"))?.translation ?? [];
    expect(carriage[0]).toBeCloseTo(1, 12);
    expect(carriage[1]).toBeCloseTo(2.3, 12);
    expect(carriage[2]).toBeCloseTo(0, 12);
  });

  it("answers the anchor assembly for an anchored assembly and normalises the rotation", async () => {
    const response = await place("carriage", {
      translation: [0, 0, 0.2],
      rotation: [0, 0, 0, 1.0000004],
    });
    expect(response.status).toBe(200);
    expect(AssemblyPlacementResponseSchema.parse(response.json)).toEqual({
      placement: { translation: [0, 0, 0.2], rotation: [0, 0, 0, 1] },
      anchor: { kind: "assembly", key: "rail" },
    });
  });
});

describe("refusing a placement", () => {
  it("answers 404 for an unknown assembly", async () => {
    expect((await place("ghost", SIDEWAYS)).status).toBe(404);
  });

  it.each([
    ["a quaternion far from unit length", { translation: [0, 0, 0], rotation: [0, 0, 0, 2] }],
    ["a missing rotation", { translation: [0, 0, 0] }],
    ["a text coordinate", { translation: ["a", 0, 0], rotation: [0, 0, 0, 1] }],
    ["a null coordinate", { translation: [null, 0, 0], rotation: [0, 0, 0, 1] }],
  ])("answers 400 for %s", async (_name, body) => {
    const response = await sendJsonRequest(
      server,
      "PUT",
      "/api/pantins/axis/assemblies/rail/placement",
      body,
    );
    expect(response.status).toBe(400);
  });
});
