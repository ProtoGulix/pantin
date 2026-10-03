import {
  AssemblyDeletionResponseSchema,
  AssemblyDeletionSchema,
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

// Deleting an assembly with its contents (ADR 0037 point 5): "rail" and
// "carriage" are hung by one prismatic joint.

let workspace: TestWorkspace;
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory);
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "axis", "fileName=carriage.stl&unit=mm", buildAsciiStl());
  await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", {
    type: "prismatic",
    name: "Axe X",
    parent: "rail",
    child: "carriage",
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.8],
  });
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

const ASSEMBLIES = "/api/pantins/axis/assemblies";

async function currentPantin() {
  return PantinResponseSchema.parse((await sendRaw(server, "GET", "/api/pantins/axis")).json);
}

describe("GET .../deletion", () => {
  it("lists the contents and changes neither the document nor the unsaved flag", async () => {
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    const before = await currentPantin();
    expect(before.unsavedChanges).toBe(false);
    const response = await sendRaw(server, "GET", `${ASSEMBLIES}/rail/deletion`);
    expect(response.status).toBe(200);
    const deletion = AssemblyDeletionSchema.parse(response.json);
    expect(deletion).toMatchObject({
      assembly: { key: "rail", name: "rail" },
      bodies: [{ id: "rail" }],
      joints: [{ id: "axe-x", name: "Axe X", betweenAssemblies: true }],
      reanchoredAssemblies: [{ key: "carriage", name: "carriage" }],
    });
    expect(deletion.removedTags).toContain("carriage.axe-x.position");
    expect(await currentPantin()).toEqual(before);
  });
});

describe("DELETE ?contents=delete", () => {
  it("answers the Pantin without the assembly and what was removed", async () => {
    const response = await sendRaw(server, "DELETE", `${ASSEMBLIES}/rail?contents=delete`);
    expect(response.status).toBe(200);
    const answer = AssemblyDeletionResponseSchema.parse(response.json);
    expect(answer.pantin.document.assemblies.map(({ key }) => key)).toEqual(["carriage"]);
    expect(answer.pantin.document.joints).toEqual([]);
    expect(answer.pantin.unsavedChanges).toBe(true);
    expect(answer.deleted.bodies.map(({ id }) => id)).toEqual(["rail"]);
    expect(answer.retainedMeshFiles).toEqual([]);
  });
});

describe("plain DELETE", () => {
  it("still deletes an empty assembly and answers a PantinResponse", async () => {
    await sendJsonRequest(server, "POST", ASSEMBLIES, { name: "Spare parts" });
    const response = await sendRaw(server, "DELETE", `${ASSEMBLIES}/spare-parts`);
    expect(response.status).toBe(200);
    expect(PantinResponseSchema.parse(response.json).document.assemblies).toHaveLength(2);
  });

  it("refuses a non empty assembly, naming its joints and the deletion with contents", async () => {
    const response = await sendRaw(server, "DELETE", `${ASSEMBLIES}/rail`);
    expect(response.status).toBe(409);
    expect(response.body).toContain("1 body, 1 joint");
    expect(response.body).toContain("contents=delete");
    expect((await currentPantin()).document.assemblies).toHaveLength(2);
  });
});

describe("refused requests", () => {
  it("answers 400 for another value of contents, changing nothing", async () => {
    const response = await sendRaw(server, "DELETE", `${ASSEMBLIES}/rail?contents=other`);
    expect(response.status).toBe(400);
    expect((await currentPantin()).document.assemblies).toHaveLength(2);
  });

  it("answers 404 for an unknown key on both routes", async () => {
    const preview = await sendRaw(server, "GET", `${ASSEMBLIES}/ghost/deletion`);
    const deletion = await sendRaw(server, "DELETE", `${ASSEMBLIES}/ghost?contents=delete`);
    expect([preview.status, deletion.status]).toEqual([404, 404]);
  });

  it("answers 409 with the same message on both routes when another assembly depends on a joint", async () => {
    await sendJsonRequest(server, "POST", "/api/pantins/axis/actuators", {
      name: "Pusher",
      assembly: "rail",
      type: "double_acting_cylinder",
      extendSpeed: 0.2,
      retractSpeed: 0.2,
      joints: ["axe-x"],
    });
    const preview = await sendRaw(server, "GET", `${ASSEMBLIES}/carriage/deletion`);
    const deletion = await sendRaw(server, "DELETE", `${ASSEMBLIES}/carriage?contents=delete`);
    expect([preview.status, deletion.status]).toEqual([409, 409]);
    expect(preview.body).toBe(deletion.body);
    expect(JSON.parse(preview.body).error.message).toContain(
      'Actuator "Pusher" of assembly "rail" moves joint "Axe X"',
    );
  });
});
