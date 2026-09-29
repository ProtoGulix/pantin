import { access } from "node:fs/promises";
import { join } from "node:path";
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
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory);
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

function meshExists(meshPath: string): Promise<boolean> {
  return access(join(workspace.pantinsDirectory, "axis", meshPath)).then(
    () => true,
    () => false,
  );
}

const discard = () => sendRaw(server, "POST", "/api/pantins/axis/discard");
const save = () => sendRaw(server, "POST", "/api/pantins/axis/save");

async function importRail() {
  return singleImportedBody(
    await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl()),
  );
}

describe("POST discard", () => {
  it("restores the saved name", async () => {
    await sendJsonRequest(server, "PATCH", "/api/pantins/axis", { name: "Renamed" });
    const response = await discard();
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ unsavedChanges: false, document: { name: "Axis" } });
  });

  it("removes an unsaved import and its mesh file", async () => {
    const rail = await importRail();
    expect(await meshExists(rail.mesh)).toBe(true);
    expect((await discard()).json).toMatchObject({
      unsavedChanges: false,
      document: { bodies: [] },
    });
    expect(await meshExists(rail.mesh)).toBe(false);
  });

  it("restores a deleted saved body, keeps its file and cancels the pending deletion", async () => {
    const rail = await importRail();
    await save();
    await sendRaw(server, "DELETE", `/api/pantins/axis/bodies/${rail.id}`);
    const response = await discard();
    expect(response.json).toMatchObject({ unsavedChanges: false, document: { bodies: [rail] } });
    await save();
    expect(await meshExists(rail.mesh)).toBe(true);
  });

  it("only loads a Pantin that is not open", async () => {
    const fresh = await startTestServer(workspace.pantinsDirectory);
    const response = await sendRaw(fresh, "POST", "/api/pantins/axis/discard");
    await fresh.close();
    expect(response.json).toMatchObject({ unsavedChanges: false, document: { name: "Axis" } });
  });

  it.each(["..", "..%2F..%2Fetc", "%2e%2e", "a%2Fb", "missing"])(
    "rejects Pantin id %s",
    async (id) => {
      const response = await sendRaw(server, "POST", `/api/pantins/${id}/discard`);
      expect([400, 404]).toContain(response.status);
    },
  );
});
