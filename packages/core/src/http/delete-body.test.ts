import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PantinDocumentSchema, PantinResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
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

let workspace: TestWorkspace;
let servers: RunningPantinServer[];
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  servers = [];
  server = await startServer();
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
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

const pantinFolder = () => join(workspace.pantinsDirectory, "axis");

async function meshExists(meshPath: string): Promise<boolean> {
  return access(join(pantinFolder(), meshPath)).then(
    () => true,
    () => false,
  );
}

async function readDiskDocument() {
  const text = await readFile(join(pantinFolder(), "pantin.json"), "utf8");
  return PantinDocumentSchema.parse(JSON.parse(text));
}

// The invariant this feature protects: pantin.json never lists a missing mesh.
async function expectDiskConsistent(): Promise<void> {
  for (const body of (await readDiskDocument()).bodies) {
    expect(await meshExists(body.mesh)).toBe(true);
  }
}

async function importRail(fileName = "rail.stl") {
  return singleImportedBody(
    await importMesh(server, "axis", `fileName=${fileName}&unit=mm`, buildAsciiStl()),
  );
}

async function deleteBody(bodyId: string) {
  return sendRaw(server, "DELETE", `/api/pantins/axis/bodies/${bodyId}`);
}

describe("DELETE a body", () => {
  it("deletes the mesh of a never saved body at once", async () => {
    const rail = await importRail();
    const response = await deleteBody(rail.id);
    expect(response.status).toBe(200);
    expect(PantinResponseSchema.parse(response.json)).toMatchObject({
      unsavedChanges: false,
      document: { bodies: [] },
    });
    expect(await meshExists(rail.mesh)).toBe(false);
  });

  it("keeps the mesh of a saved body until the next save", async () => {
    const rail = await importRail();
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    const response = await deleteBody(rail.id);
    expect(PantinResponseSchema.parse(response.json).unsavedChanges).toBe(true);
    expect(await meshExists(rail.mesh)).toBe(true);
    await expectDiskConsistent();

    await sendRaw(server, "POST", "/api/pantins/axis/save");
    expect(await meshExists(rail.mesh)).toBe(false);
    expect((await readDiskDocument()).bodies).toEqual([]);
    const reopened = await sendRaw(await startServer(), "GET", "/api/pantins/axis");
    expect(reopened.json).toMatchObject({ unsavedChanges: false, document: { bodies: [] } });
  });

  it("gives a re-import a new mesh name while the old one awaits deletion", async () => {
    const rail = await importRail();
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    await deleteBody(rail.id);
    const again = await importRail();
    expect(again.mesh).toBe("meshes/rail-2.stl");
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    expect(await meshExists(rail.mesh)).toBe(false);
    expect(await meshExists(again.mesh)).toBe(true);
    await expectDiskConsistent();
  });
});

describe("DELETE a body: errors and concurrency", () => {
  it("answers 404 for an unknown body and 400 for an invalid id", async () => {
    expect((await deleteBody("missing")).status).toBe(404);
    expect((await deleteBody("..")).status).toBe(400);
    expect((await sendRaw(server, "DELETE", "/api/pantins/nope/bodies/rail")).status).toBe(404);
  });

  it("keeps the disk consistent when deletes and saves run concurrently", async () => {
    for (let round = 0; round < 5; round += 1) {
      const saved = await importRail(`saved-${round}.stl`);
      await sendRaw(server, "POST", "/api/pantins/axis/save");
      const unsaved = await importRail(`unsaved-${round}.stl`);
      await Promise.all([
        sendRaw(server, "POST", "/api/pantins/axis/save"),
        deleteBody(saved.id),
        deleteBody(unsaved.id),
        sendRaw(server, "POST", "/api/pantins/axis/save"),
      ]);
      await expectDiskConsistent();
    }
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    expect((await readDiskDocument()).bodies).toEqual([]);
    await expectDiskConsistent();
  });
});

describe("listing Pantins", () => {
  it("does not open them: a later external edit is seen when opening", async () => {
    const fresh = await startServer();
    await sendRaw(fresh, "GET", "/api/pantins");
    const path = join(pantinFolder(), "pantin.json");
    const edited = { ...(await readDiskDocument()), name: "Edited by hand" };
    await writeFile(path, JSON.stringify(edited));
    const opened = await sendRaw(fresh, "GET", "/api/pantins/axis");
    expect(opened.json).toMatchObject({ document: { name: "Edited by hand" } });
  });

  it("shows the unsaved name of an open Pantin", async () => {
    await sendJsonRequest(server, "PATCH", "/api/pantins/axis", { name: "Renamed" });
    const listed = await sendRaw(server, "GET", "/api/pantins");
    expect(listed.json).toEqual({ pantins: [{ id: "axis", name: "Renamed", bodyCount: 0 }] });
  });
});
