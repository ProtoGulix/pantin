import {
  AssemblyDeletionResponseSchema,
  AssemblyDeletionSchema,
  bodyEndpoint,
  groupEndpoint,
  PantinResponseSchema,
  RenamedTagsResponseSchema,
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

// The structure tree routes (ADR 0040 point 7): "rail" and "carriage" are
// joined by one prismatic joint; "carriage" is then put inside "rail".

let workspace: TestWorkspace;
let server: RunningPantinServer;
const ASSEMBLIES = "/api/pantins/axis/assemblies";

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory);
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "axis", "fileName=carriage.stl&unit=mm", buildAsciiStl());
  await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", {
    type: "prismatic",
    name: "Axe X",
    parent: bodyEndpoint("rail"),
    child: groupEndpoint("carriage"),
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.8],
  });
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

const parents = (json: unknown) =>
  Object.fromEntries(
    PantinResponseSchema.parse(json).document.assemblies.map(({ key, parent }) => [key, parent]),
  );

async function nestCarriage() {
  return sendJsonRequest(server, "PUT", `${ASSEMBLIES}/carriage/parent`, { parent: "rail" });
}

describe("POST .../assemblies with a parent", () => {
  it("creates the assembly inside an existing one", async () => {
    const created = await sendJsonRequest(server, "POST", ASSEMBLIES, {
      name: "Spare",
      parent: "rail",
    });
    expect(created.status).toBe(201);
    expect(parents(created.json)).toMatchObject({ spare: "rail" });
  });

  it("answers 404 with an actionable message for an unknown parent", async () => {
    const created = await sendJsonRequest(server, "POST", ASSEMBLIES, {
      name: "Spare",
      parent: "ghost",
    });
    expect(created.status).toBe(404);
    expect(created.body).toContain('no assembly \\"ghost\\"');
  });
});

describe("PUT .../parent", () => {
  it("moves an assembly, then back to top level, without touching its placement", async () => {
    const before = PantinResponseSchema.parse(
      (await sendRaw(server, "GET", "/api/pantins/axis")).json,
    );
    const nested = await nestCarriage();
    expect(nested.status).toBe(200);
    expect(parents(nested.json)).toMatchObject({ carriage: "rail" });
    const placement = (json: unknown, key: string) =>
      PantinResponseSchema.parse(json).document.assemblies.find((item) => item.key === key)
        ?.placement;
    expect(placement(nested.json, "carriage")).toEqual(
      before.document.assemblies.find((item) => item.key === "carriage")?.placement,
    );
    const top = await sendJsonRequest(server, "PUT", `${ASSEMBLIES}/carriage/parent`, {
      parent: null,
    });
    expect(parents(top.json).carriage).toBeUndefined();
  });

  it("refuses a loop, itself included, with 409 naming the assembly", async () => {
    await nestCarriage();
    const loop = await sendJsonRequest(server, "PUT", `${ASSEMBLIES}/rail/parent`, {
      parent: "carriage",
    });
    const self = await sendJsonRequest(server, "PUT", `${ASSEMBLIES}/rail/parent`, {
      parent: "rail",
    });
    expect([loop.status, self.status]).toEqual([409, 409]);
    expect(loop.body).toContain('Assembly \\"rail\\" would contain itself');
  });

  it("answers 404 for an unknown assembly or parent, 400 for a bad body", async () => {
    const unknown = await sendJsonRequest(server, "PUT", `${ASSEMBLIES}/ghost/parent`, {
      parent: null,
    });
    const ghostParent = await sendJsonRequest(server, "PUT", `${ASSEMBLIES}/rail/parent`, {
      parent: "ghost",
    });
    const bad = await sendJsonRequest(server, "PUT", `${ASSEMBLIES}/rail/parent`, {});
    expect([unknown.status, ghostParent.status, bad.status]).toEqual([404, 404, 400]);
  });

  it("follows a key rename: the children point at the new key", async () => {
    await nestCarriage();
    const renamed = await sendJsonRequest(server, "PUT", `${ASSEMBLIES}/rail/key`, { key: "base" });
    const { pantin } = RenamedTagsResponseSchema.parse(renamed.json);
    expect(parents(pantin)).toMatchObject({ base: undefined, carriage: "base" });
  });
});

describe("deleting an assembly that contains another", () => {
  it("is refused without contents, naming the sub-assemblies", async () => {
    await nestCarriage();
    const refused = await sendRaw(server, "DELETE", `${ASSEMBLIES}/rail`);
    expect(refused.status).toBe(409);
    expect(refused.body).toContain("sub-assemblies");
  });

  it("previews and deletes the whole subtree with contents", async () => {
    await nestCarriage();
    const preview = AssemblyDeletionSchema.parse(
      (await sendRaw(server, "GET", `${ASSEMBLIES}/rail/deletion`)).json,
    );
    expect(preview.descendantAssemblies).toEqual([{ key: "carriage", name: "carriage" }]);
    const response = await sendRaw(server, "DELETE", `${ASSEMBLIES}/rail?contents=delete`);
    const answer = AssemblyDeletionResponseSchema.parse(response.json);
    expect(answer.pantin.document.assemblies).toEqual([]);
    expect(answer.pantin.document.bodies).toEqual([]);
    expect(answer.deleted.bodies.map(({ id }) => id)).toEqual(["rail", "carriage"]);
  });
});
