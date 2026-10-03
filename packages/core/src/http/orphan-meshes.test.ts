import { mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  OrphanMeshDeletionResponseSchema,
  OrphanMeshListSchema,
  PantinResponseSchema,
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

// The orphan mesh routes (ADR 0038 point 3).

let workspace: TestWorkspace;
let server: RunningPantinServer;

const meshes = () => join(workspace.pantinsDirectory, "axis", "meshes");
const LIST = "/api/pantins/axis/orphan-meshes";
const DELETE = `${LIST}/delete`;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory);
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await writeFile(join(meshes(), "ghost.glb"), "12345");
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

const currentPantin = async () =>
  PantinResponseSchema.parse((await sendRaw(server, "GET", "/api/pantins/axis")).json);

describe("the routes", () => {
  it("answers the list on GET", async () => {
    const response = await sendRaw(server, "GET", LIST);
    expect(response.status).toBe(200);
    expect(OrphanMeshListSchema.parse(response.json)).toEqual({
      files: [{ fileName: "ghost.glb", sizeInBytes: 5 }],
      totalSizeInBytes: 5,
    });
  });

  it("answers 404 on both routes for an unknown Pantin", async () => {
    const get = await sendRaw(server, "GET", "/api/pantins/nope/orphan-meshes");
    const post = await sendJsonRequest(server, "POST", "/api/pantins/nope/orphan-meshes/delete", {
      fileNames: [],
    });
    expect([get.status, post.status]).toEqual([404, 404]);
  });

  it("deletes on POST and leaves the unsaved flag as it was", async () => {
    const before = await currentPantin();
    const response = await sendJsonRequest(server, "POST", DELETE, {
      fileNames: ["ghost.glb", "rail.stl"],
    });
    expect(response.status).toBe(200);
    expect(OrphanMeshDeletionResponseSchema.parse(response.json)).toEqual({
      deleted: [{ fileName: "ghost.glb", sizeInBytes: 5 }],
      skipped: ["rail.stl"],
      failed: [],
    });
    expect((await currentPantin()).unsavedChanges).toBe(before.unsavedChanges);
  });
});

describe("invalid deletion requests", () => {
  const tooMany = { fileNames: Array.from({ length: 201 }, (_, index) => `f${index}.glb`) };
  it.each([
    ["an empty name", { fileNames: [""] }],
    ["..", { fileNames: [".."] }],
    ["a path to pantin.json", { fileNames: ["../pantin.json"] }],
    ["a name with a slash", { fileNames: ["a/b.glb"] }],
    ["201 names", tooMany],
    ["a body that is not an array", ["ghost.glb"]],
  ])("answers 400 for %s and changes nothing", async (_case, body) => {
    const documentPath = join(workspace.pantinsDirectory, "axis", "pantin.json");
    const before = await readFile(documentPath, "utf8");
    const response = await sendJsonRequest(server, "POST", DELETE, body);
    expect(response.status).toBe(400);
    expect(await readFile(documentPath, "utf8")).toBe(before);
    expect(await readFile(join(meshes(), "ghost.glb"), "utf8")).toBe("12345");
  });

  it("answers an error for a wrong content type", async () => {
    const bytes = new TextEncoder().encode('{"fileNames":[]}');
    const response = await sendRaw(server, "POST", DELETE, { contentType: "text/plain", bytes });
    expect(response.status).toBe(415);
  });
});

describe("a symbolic link on meshes/", () => {
  it("answers 400 on both routes", async () => {
    const outside = join(workspace.root, "outside-meshes");
    await mkdir(outside);
    await rename(meshes(), join(workspace.root, "moved-meshes"));
    await symlink(outside, meshes());
    const get = await sendRaw(server, "GET", LIST);
    const post = await sendJsonRequest(server, "POST", DELETE, { fileNames: ["ghost.glb"] });
    expect([get.status, post.status]).toEqual([400, 400]);
    await rm(meshes());
  });
});
