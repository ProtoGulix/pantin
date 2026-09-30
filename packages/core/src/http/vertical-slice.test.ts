import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Body,
  BodyResponseSchema,
  PantinDocumentSchema,
  PantinListResponseSchema,
  type PantinResponse,
  PantinResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSampleGlb, SAMPLE_GLB_NODE_NAMES } from "../test-support/mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  sendJsonRequest,
  sendRaw,
  singleImportedBody,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

const [rootName, childA, childB, childC] = SAMPLE_GLB_NODE_NAMES;
const EXPECTED_NODES = [
  { name: rootName, path: [0] },
  { name: childA, path: [0, 1] },
  { name: childB, path: [0, 2] },
  { name: childC, path: [0, 3] },
  { name: childA, path: [0, 4, 5] },
];

let workspace: TestWorkspace;
let servers: RunningPantinServer[];

beforeEach(async () => {
  workspace = await createTestWorkspace();
  servers = [];
});

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  await workspace.remove();
});

async function startServer(): Promise<RunningPantinServer> {
  const server = await startTestServer(workspace.pantinsDirectory);
  servers.push(server);
  return server;
}

async function createPantinWithGlb(server: RunningPantinServer): Promise<Body> {
  const created = await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axe 800" });
  expect(created.status).toBe(201);
  expect(PantinResponseSchema.parse(created.json).id).toBe("axe-800");
  const imported = await importMesh(
    server,
    "axe-800",
    "fileName=3630.00.0800N.glb",
    buildSampleGlb(),
  );
  expect(imported.status).toBe(201);
  return singleImportedBody(imported);
}

async function getPantin(server: RunningPantinServer, pantinId: string): Promise<PantinResponse> {
  const response = await sendRaw(server, "GET", `/api/pantins/${pantinId}`);
  expect(response.status).toBe(200);
  return PantinResponseSchema.parse(response.json);
}

describe("vertical slice", () => {
  it("listens on 127.0.0.1 only", async () => {
    const server = await startServer();
    expect(server.address.address).toBe("127.0.0.1");
    expect(server.address.family).toBe("IPv4");
  });

  it("creates, imports, renames, saves and reopens an identical Pantin", async () => {
    const firstServer = await startServer();
    const body = await createPantinWithGlb(firstServer);
    expect(body).toMatchObject({ id: "3630-00-0800n", mesh: "meshes/3630-00-0800n.glb" });
    expect(body.source).toMatchObject({ format: "glb", unit: "m", upAxis: "y" });

    await sendJsonRequest(firstServer, "PATCH", "/api/pantins/axe-800", { name: "Axe X" });
    await sendJsonRequest(firstServer, "PATCH", `/api/pantins/axe-800/bodies/${body.id}`, {
      name: "Rail",
    });
    expect((await getPantin(firstServer, "axe-800")).unsavedChanges).toBe(true);
    const saved = await sendRaw(firstServer, "POST", "/api/pantins/axe-800/save");
    const savedResponse = PantinResponseSchema.parse(saved.json);
    expect(savedResponse.unsavedChanges).toBe(false);
    expect(savedResponse.document.name).toBe("Axe X");

    const secondServer = await startServer();
    const reopened = await getPantin(secondServer, "axe-800");
    expect(reopened).toEqual(savedResponse);
    const listed = await sendRaw(secondServer, "GET", "/api/pantins");
    expect(PantinListResponseSchema.parse(listed.json).pantins).toEqual([
      { id: "axe-800", name: "Axe X", bodyCount: 1, modifiedAt: expect.any(String) },
    ]);
  });
});

describe("original node names", () => {
  it("keeps the original GLB node names after a rename, in memory and on disk", async () => {
    const firstServer = await startServer();
    const body = await createPantinWithGlb(firstServer);
    expect(body.source.nodes).toEqual(EXPECTED_NODES);

    const renamed = await sendJsonRequest(
      firstServer,
      "PATCH",
      `/api/pantins/axe-800/bodies/${body.id}`,
      { name: "Rail renamed" },
    );
    const renamedBody = BodyResponseSchema.parse(renamed.json).body;
    expect(renamedBody.name).toBe("Rail renamed");
    expect(renamedBody.source.nodes).toEqual(EXPECTED_NODES);
    expect(renamedBody.source.fileName).toBe("3630.00.0800N.glb");
    await sendRaw(firstServer, "POST", "/api/pantins/axe-800/save");

    const fileText = await readFile(
      join(workspace.pantinsDirectory, "axe-800", "pantin.json"),
      "utf8",
    );
    const onDisk = PantinDocumentSchema.parse(JSON.parse(fileText));
    expect(onDisk.bodies[0]?.name).toBe("Rail renamed");
    expect(onDisk.bodies[0]?.source.nodes).toEqual(EXPECTED_NODES);

    const reopened = await getPantin(await startServer(), "axe-800");
    expect(reopened.document.bodies[0]?.source.nodes).toEqual(EXPECTED_NODES);
  });
});

describe("ids and meshes", () => {
  it("gives unique ids to Pantins and bodies with the same name", async () => {
    const server = await startServer();
    await createPantinWithGlb(server);
    const second = await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axe 800" });
    expect(PantinResponseSchema.parse(second.json).id).toBe("axe-800-2");
    const again = await importMesh(
      server,
      "axe-800",
      "fileName=3630.00.0800N.glb",
      buildSampleGlb(),
    );
    expect(singleImportedBody(again).id).toBe("3630-00-0800n-2");
  });

  it("serves an imported mesh with its content type", async () => {
    const server = await startServer();
    const body = await createPantinWithGlb(server);
    const mesh = await sendRaw(server, "GET", `/api/pantins/axe-800/${body.mesh}`);
    expect(mesh.status).toBe(200);
    expect(mesh.contentType).toBe("model/gltf-binary");
    expect(new Uint8Array(mesh.bytes)).toEqual(buildSampleGlb());
  });
});

describe("invalid pantin.json", () => {
  it("reports an invalid pantin.json with a clear error instead of crashing", async () => {
    const folder = join(workspace.pantinsDirectory, "broken");
    await mkdir(folder);
    await writeFile(join(folder, "pantin.json"), '{"schema_version": 2}');
    const server = await startServer();
    const response = await sendRaw(server, "GET", "/api/pantins/broken");
    expect(response.status).toBe(409);
    expect(response.json).toMatchObject({ error: { code: "conflict" } });
    expect(response.body).toContain("broken/pantin.json is not a valid Pantin");
    expect(response.body).not.toContain(workspace.root);
    const listed = await sendRaw(server, "GET", "/api/pantins");
    expect(listed.json).toEqual({ pantins: [] });
  });
});
