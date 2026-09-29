import {
  PantinResponseSchema,
  RenamedTagsResponseSchema,
  TagListResponseSchema,
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

// Assembly and key routes (ADR 0019). Each STL import creates its assembly,
// named after the file: "rail" and "carriage".

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

async function tagNames(): Promise<string[]> {
  const response = await sendRaw(server, "GET", "/api/pantins/axis/tags");
  return TagListResponseSchema.parse(response.json).tags.map((tag) => tag.name);
}

describe("key renames", () => {
  it("renames an assembly key, rewrites its bodies and reports the renamed tags", async () => {
    await sendJsonRequest(server, "PUT", "/api/pantins/axis/joints/axe-x/position", {
      position: 0.3,
    });
    const response = await sendJsonRequest(
      server,
      "PUT",
      "/api/pantins/axis/assemblies/carriage/key",
      {
        key: "chariot",
      },
    );
    const { pantin, renamedTags } = RenamedTagsResponseSchema.parse(response.json);
    expect(renamedTags).toEqual([
      { from: "carriage.axe-x.setpoint", to: "chariot.axe-x.setpoint" },
      { from: "carriage.axe-x.position", to: "chariot.axe-x.position" },
    ]);
    expect(pantin.document.bodies.map((body) => body.assembly)).toEqual(["rail", "chariot"]);
    // Runtime state is keyed by joint id: the position survives the rename.
    const tags = await sendRaw(server, "GET", "/api/pantins/axis/tags");
    expect(tags.json).toMatchObject({ tags: [{}, { name: "chariot.axe-x.position", value: 0.3 }] });
  });

  it("renames a joint's tag key", async () => {
    const response = await sendJsonRequest(
      server,
      "PUT",
      "/api/pantins/axis/joints/axe-x/tag-key",
      {
        tagKey: "course",
      },
    );
    expect(RenamedTagsResponseSchema.parse(response.json).renamedTags).toHaveLength(2);
    expect(await tagNames()).toEqual(["carriage.course.setpoint", "carriage.course.position"]);
  });

  it("refuses a taken key with 409 and a free one, and a bad key with 400", async () => {
    const taken = await sendJsonRequest(
      server,
      "PUT",
      "/api/pantins/axis/assemblies/carriage/key",
      {
        key: "rail",
      },
    );
    expect(taken.status).toBe(409);
    expect(taken.body).toContain('\\"rail-2\\" is free');
    const bad = await sendJsonRequest(server, "PUT", "/api/pantins/axis/assemblies/carriage/key", {
      key: "Verin.Pince",
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toContain('Try \\"verin-pince\\"');
  });
});

describe("assemblies", () => {
  it("renames the display name without touching any tag", async () => {
    const response = await sendJsonRequest(
      server,
      "PATCH",
      "/api/pantins/axis/assemblies/carriage",
      {
        name: "Chariot 3630",
      },
    );
    const pantin = PantinResponseSchema.parse(response.json);
    expect(pantin.document.assemblies[1]).toEqual({ key: "carriage", name: "Chariot 3630" });
    expect(await tagNames()).toEqual(["carriage.axe-x.setpoint", "carriage.axe-x.position"]);
  });

  it("creates an empty assembly, deletes it, and refuses to delete one with bodies", async () => {
    const created = await sendJsonRequest(server, "POST", "/api/pantins/axis/assemblies", {
      name: "Spare parts",
    });
    expect(created.status).toBe(201);
    const deleted = await sendRaw(server, "DELETE", "/api/pantins/axis/assemblies/spare-parts");
    expect(deleted.status).toBe(200);
    const refused = await sendRaw(server, "DELETE", "/api/pantins/axis/assemblies/rail");
    expect(refused.status).toBe(409);
    expect(refused.body).toContain("Move or delete them first");
  });

  it("moves a body with its parent joint, whose tags follow", async () => {
    const response = await sendJsonRequest(
      server,
      "PUT",
      "/api/pantins/axis/bodies/carriage/assembly",
      {
        assembly: "rail",
      },
    );
    const { pantin, renamedTags } = RenamedTagsResponseSchema.parse(response.json);
    expect(pantin.document.bodies.map((body) => body.assembly)).toEqual(["rail", "rail"]);
    expect(renamedTags.map((tag) => tag.to)).toEqual([
      "rail.axe-x.setpoint",
      "rail.axe-x.position",
    ]);
  });
});

describe("unknown targets and no-op changes", () => {
  it.each([
    ["PUT", "/api/pantins/axis/assemblies/ghost/key", { key: "x" }],
    ["PUT", "/api/pantins/axis/joints/ghost/tag-key", { tagKey: "x" }],
    ["PUT", "/api/pantins/axis/bodies/ghost/assembly", { assembly: "rail" }],
    ["PUT", "/api/pantins/axis/bodies/carriage/assembly", { assembly: "ghost" }],
    ["PATCH", "/api/pantins/axis/assemblies/ghost", { name: "X" }],
  ])("answers 404 for %s %s", async (method, path, body) => {
    expect((await sendJsonRequest(server, method, path, body)).status).toBe(404);
  });

  it("renames nothing when a key or an assembly stays the same", async () => {
    for (const [path, body] of [
      ["/api/pantins/axis/assemblies/carriage/key", { key: "carriage" }],
      ["/api/pantins/axis/joints/axe-x/tag-key", { tagKey: "axe-x" }],
      ["/api/pantins/axis/bodies/carriage/assembly", { assembly: "carriage" }],
    ] as const) {
      const response = await sendJsonRequest(server, "PUT", path, body);
      expect(RenamedTagsResponseSchema.parse(response.json).renamedTags).toEqual([]);
    }
  });
});
