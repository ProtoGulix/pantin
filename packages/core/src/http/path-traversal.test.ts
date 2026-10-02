import { readdir } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  SENTINEL_CONTENT,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

const HOSTILE_PANTIN_IDS = [
  "..",
  "../../etc",
  "..%2F..%2Fetc",
  "%2e%2e",
  "%2E%2E",
  "a%2Fb",
  "%2F",
  ".",
];
const HOSTILE_FILE_NAMES = [
  "..%2Fsentinel.stl",
  "..%2F..%2Fsentinel.stl",
  "%2e%2e%2F%2e%2e%2Fsentinel.stl",
  "..",
  "sentinel.stl",
  "pantin.json",
  "rail.stl%00.glb",
  "..%2Fsentinel.faces.json",
  "rail.json",
  "rail.stl.faces.json",
  ".faces.json",
];

let workspace: TestWorkspace;
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory);
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Safe" });
  await importMesh(server, "safe", "fileName=rail.stl&unit=mm", buildAsciiStl());
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

function expectRejected(status: number): void {
  expect([400, 404]).toContain(status);
}

async function expectWorkspaceUntouched(): Promise<void> {
  expect((await readdir(workspace.root)).sort()).toEqual(["pantins", "sentinel.stl"]);
  expect(await readdir(workspace.pantinsDirectory)).toEqual(["safe"]);
}

describe("path traversal", () => {
  it.each(HOSTILE_PANTIN_IDS)("rejects GET, PATCH, save and import on pantin id %s", async (id) => {
    expectRejected((await sendRaw(server, "GET", `/api/pantins/${id}`)).status);
    expectRejected(
      (await sendJsonRequest(server, "PATCH", `/api/pantins/${id}`, { name: "x" })).status,
    );
    expectRejected((await sendRaw(server, "POST", `/api/pantins/${id}/save`)).status);
    const imported = await importMesh(server, id, "fileName=x.stl&unit=mm", buildAsciiStl());
    expectRejected(imported.status);
    await expectWorkspaceUntouched();
  });

  it.each(HOSTILE_PANTIN_IDS)(
    "rejects body renames and deletions with body id %s",
    async (bodyId) => {
      const path = `/api/pantins/safe/bodies/${bodyId}`;
      expectRejected((await sendJsonRequest(server, "PATCH", path, { name: "x" })).status);
      expectRejected((await sendRaw(server, "DELETE", path)).status);
      await expectWorkspaceUntouched();
    },
  );

  it.each(HOSTILE_FILE_NAMES)("never serves mesh file name %s", async (fileName) => {
    const response = await sendRaw(server, "GET", `/api/pantins/safe/meshes/${fileName}`);
    expectRejected(response.status);
    expect(response.body).not.toContain(SENTINEL_CONTENT);
  });

  it("serves the legitimate mesh, proving the rejections above are not accidental", async () => {
    const response = await sendRaw(server, "GET", "/api/pantins/safe/meshes/rail.stl");
    expect(response.status).toBe(200);
    expect(response.contentType).toBe("model/stl");
  });

  it("keeps a hostile import file name as data only", async () => {
    const imported = await importMesh(
      server,
      "safe",
      "fileName=..%2F..%2Fsentinel.stl&unit=mm",
      buildAsciiStl(),
    );
    expect(imported.status).toBe(201);
    expect(imported.json).toMatchObject({
      bodies: [{ id: "sentinel", mesh: "meshes/sentinel.stl" }],
    });
    await expectWorkspaceUntouched();
  });

  it("rejects badly encoded paths", async () => {
    expect((await sendRaw(server, "GET", "/api/pantins/%E0%A4%A")).status).toBe(400);
  });
});
