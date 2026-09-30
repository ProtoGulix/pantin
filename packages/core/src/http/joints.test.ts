import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JointResponseSchema, PANTIN_SCHEMA_VERSION, PoseResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  type RawResponse,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

let workspace: TestWorkspace;
let servers: RunningPantinServer[];
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  servers = [];
  server = await startServer();
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "axis", "fileName=carriage.stl&unit=mm", buildAsciiStl());
});

afterEach(async () => {
  await Promise.all(servers.map((running) => running.close()));
  await workspace.remove();
});

async function startServer(): Promise<RunningPantinServer> {
  const running = await startTestServer(workspace.pantinsDirectory);
  servers.push(running);
  return running;
}

const PRISMATIC = {
  type: "prismatic",
  name: "Axe X",
  parent: "rail",
  child: "carriage",
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 0.8],
};

function setPosition(running: RunningPantinServer, position: number): Promise<RawResponse> {
  return sendJsonRequest(running, "PUT", "/api/pantins/axis/joints/axe-x/position", { position });
}

function poseOf(response: RawResponse, bodyId: string) {
  const pose = PoseResponseSchema.parse(response.json).bodies.find(
    (body) => body.bodyId === bodyId,
  );
  if (pose === undefined) {
    throw new Error(`No pose for ${bodyId}`);
  }
  return pose;
}

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 12);
  });
}

describe("prismatic joint exit test (ADR 0011)", () => {
  it("moves, clamps, saves and comes back at position 0 after a restart", async () => {
    const created = await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", PRISMATIC);
    expect(created.status).toBe(201);
    expect(JointResponseSchema.parse(created.json).joint).toEqual({
      id: "axe-x",
      tagKey: "axe-x",
      ...PRISMATIC,
    });

    const middle = await setPosition(server, 0.4);
    expect(middle.status).toBe(200);
    expectClose(poseOf(middle, "carriage").translation, [0.4, 0, 0]);
    expect(poseOf(middle, "carriage").rotation).toEqual([0, 0, 0, 1]);
    expect(poseOf(middle, "rail")).toEqual({
      bodyId: "rail",
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });

    const beyond = await setPosition(server, 1.0);
    expect(PoseResponseSchema.parse(beyond.json).jointPositions).toEqual([
      { jointId: "axe-x", position: 0.8 },
    ]);
    expectClose(poseOf(beyond, "carriage").translation, [0.8, 0, 0]);
    const below = await setPosition(server, -0.1);
    expect(PoseResponseSchema.parse(below.json).jointPositions).toEqual([
      { jointId: "axe-x", position: 0 },
    ]);

    await setPosition(server, 0.5);
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    const restarted = await startServer();
    const joints = await sendRaw(restarted, "GET", "/api/pantins/axis/joints");
    expect(joints.json).toEqual({ joints: [{ id: "axe-x", tagKey: "axe-x", ...PRISMATIC }] });
    const pose = await sendRaw(restarted, "GET", "/api/pantins/axis/pose");
    expect(PoseResponseSchema.parse(pose.json).jointPositions).toEqual([
      { jointId: "axe-x", position: 0 },
    ]);
    expect(poseOf(pose, "carriage").translation).toEqual([0, 0, 0]);
  });
});

describe("revolute joint", () => {
  it("rotates the child about an axis through a non-zero origin", async () => {
    const hinge = {
      ...PRISMATIC,
      type: "revolute",
      name: "Hinge",
      origin: [1, 2, 0],
      axis: [0, 0, 1],
      limits: [-3, 3],
    };
    await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", hinge);
    const response = await sendJsonRequest(
      server,
      "PUT",
      "/api/pantins/axis/joints/hinge/position",
      {
        position: Math.PI / 2,
      },
    );
    const { translation, rotation } = poseOf(response, "carriage");
    const half = Math.SQRT1_2;
    expectClose(rotation, [0, 0, half, half]);
    // x -> R (x - o) + o with o = (1, 2, 0): t = o - R o = (1, 2, 0) - (-2, 1, 0).
    expectClose(translation, [3, 1, 0]);
  });
});

describe("joint errors", () => {
  it.each([
    [{ ...PRISMATIC, parent: "nope" }, /parent body "nope" does not exist/],
    [{ ...PRISMATIC, child: "rail" }, /cannot link body "rail" to itself/],
    [{ ...PRISMATIC, limits: [1, 0] }, /lower limit/],
    [{ ...PRISMATIC, axis: [0, 0, 0] }, /zero vector/],
    [{ ...PRISMATIC, type: "spherical" }, /type/],
  ])("refuses %j with 400", async (request, message) => {
    const response = await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", request);
    expect(response.status).toBe(400);
    expect(response.json).toMatchObject({
      error: { code: "invalid_request", message: expect.stringMatching(message) },
    });
  });

  it("refuses a second parent and a cycle", async () => {
    await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", PRISMATIC);
    const second = await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", {
      ...PRISMATIC,
      name: "Other",
    });
    expect(second.body).toContain("already has the parent joint");
    const back = { ...PRISMATIC, name: "Back", parent: "carriage", child: "rail" };
    expect(
      (await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", back)).body,
    ).toContain("cycle");
  });

  it("answers 404 for unknown joints and 400 for invalid ids", async () => {
    expect((await setPosition(server, 1)).status).toBe(404);
    expect((await sendRaw(server, "DELETE", "/api/pantins/axis/joints/nope")).status).toBe(404);
    expect((await sendRaw(server, "DELETE", "/api/pantins/axis/joints/..")).status).toBe(400);
    expect((await sendRaw(server, "GET", "/api/pantins/%2e%2e/pose")).status).toBe(400);
    const encoded = await sendJsonRequest(
      server,
      "PUT",
      "/api/pantins/axis/joints/a%2Fb/position",
      { position: 0 },
    );
    expect(encoded.status).toBe(400);
  });
});

describe("joints in the document lifecycle", () => {
  it("refuses to delete a body used by a joint, then allows it once the joint is deleted", async () => {
    await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", PRISMATIC);
    const refused = await sendRaw(server, "DELETE", "/api/pantins/axis/bodies/rail");
    expect(refused.status).toBe(409);
    expect(refused.json).toMatchObject({
      error: {
        code: "conflict",
        message: 'Body "rail" is used by joint "axe-x". Delete the joint first.',
      },
    });
    const deleted = await sendRaw(server, "DELETE", "/api/pantins/axis/joints/axe-x");
    expect(deleted.json).toMatchObject({ unsavedChanges: true, document: { joints: [] } });
    expect((await sendRaw(server, "DELETE", "/api/pantins/axis/bodies/rail")).status).toBe(200);
  });

  it("resets positions and drops unsaved joints on discard", async () => {
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", PRISMATIC);
    await setPosition(server, 0.3);
    const discarded = await sendRaw(server, "POST", "/api/pantins/axis/discard");
    expect(discarded.json).toMatchObject({ unsavedChanges: false, document: { joints: [] } });
    const pose = await sendRaw(server, "GET", "/api/pantins/axis/pose");
    expect(PoseResponseSchema.parse(pose.json).jointPositions).toEqual([]);
  });
});

describe("schema version 1 on disk", () => {
  it("opens a version 1 pantin.json and saves it in the current version", async () => {
    const folder = join(workspace.pantinsDirectory, "legacy");
    await mkdir(join(folder, "meshes"), { recursive: true });
    await writeFile(
      join(folder, "pantin.json"),
      JSON.stringify({ schema_version: 1, name: "Legacy", bodies: [] }),
    );
    const opened = await sendRaw(server, "GET", "/api/pantins/legacy");
    expect(opened.json).toMatchObject({
      unsavedChanges: false,
      document: { schema_version: PANTIN_SCHEMA_VERSION, joints: [] },
    });
    await sendRaw(server, "POST", "/api/pantins/legacy/save");
    const onDisk: unknown = JSON.parse(await readFile(join(folder, "pantin.json"), "utf8"));
    expect(onDisk).toEqual({
      schema_version: PANTIN_SCHEMA_VERSION,
      name: "Legacy",
      assemblies: [{ key: "main", name: "main" }],
      bodies: [],
      joints: [],
      drives: [],
      sensors: [],
    });
  });

  it("answers 409 for a newer schema version", async () => {
    const folder = join(workspace.pantinsDirectory, "future");
    await mkdir(folder);
    await writeFile(
      join(folder, "pantin.json"),
      JSON.stringify({ schema_version: 9, name: "F", bodies: [] }),
    );
    const response = await sendRaw(server, "GET", "/api/pantins/future");
    expect(response.status).toBe(409);
    expect(response.body).toContain("newer than this core supports");
  });
});

describe("joint update", () => {
  it("changes the fields but not the id, clamps the position to the new limits, and is unsaved", async () => {
    await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", PRISMATIC);
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    await setPosition(server, 0.6);

    const narrower = { ...PRISMATIC, name: "Axe X court", limits: [0, 0.2] };
    const updated = await sendJsonRequest(
      server,
      "PATCH",
      "/api/pantins/axis/joints/axe-x",
      narrower,
    );
    expect(updated.status).toBe(200);
    expect(JointResponseSchema.parse(updated.json).joint).toEqual({
      id: "axe-x",
      tagKey: "axe-x",
      ...narrower,
    });

    const pose = await sendRaw(server, "GET", "/api/pantins/axis/pose");
    expect(PoseResponseSchema.parse(pose.json).jointPositions).toEqual([
      { jointId: "axe-x", position: 0.2 },
    ]);
    const pantin = await sendRaw(server, "GET", "/api/pantins/axis");
    expect(pantin.json).toMatchObject({ unsavedChanges: true });
  });

  it("answers 404 for an unknown joint", async () => {
    const response = await sendJsonRequest(
      server,
      "PATCH",
      "/api/pantins/axis/joints/ghost",
      PRISMATIC,
    );
    expect(response.status).toBe(404);
  });
});
