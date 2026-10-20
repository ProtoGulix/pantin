import { bodyEndpoint, groupEndpoint, SignalListResponseSchema } from "@pantin/protocol";
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

// GET /api/pantins/:pantinId/signals (ADR 0064 point 2): the signals of the
// open document, unsaved edits included.

let workspace: TestWorkspace;
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  server = await startTestServer(workspace.pantinsDirectory);
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "axis", "fileName=carriage.stl&unit=mm", buildAsciiStl());
});

afterEach(async () => {
  await server.close();
  await workspace.remove();
});

async function readSignals() {
  const response = await sendRaw(server, "GET", "/api/pantins/axis/signals");
  expect(response.status).toBe(200);
  return SignalListResponseSchema.parse(response.json).signals;
}

describe("signals route", () => {
  it("answers an empty list for a Pantin with no tag", async () => {
    expect(await readSignals()).toEqual([]);
  });

  it("lists the signals of an edit that is not saved yet, with their units", async () => {
    await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", {
      type: "prismatic",
      name: "Stroke",
      parent: bodyEndpoint("rail"),
      child: groupEndpoint("carriage"),
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 0.1],
    });
    expect(await readSignals()).toEqual([
      expect.objectContaining({
        name: "carriage.stroke.setpoint",
        direction: "command",
        unit: "metre",
        owner: { kind: "joint", id: "stroke", name: "Stroke" },
        member: "setpoint",
      }),
      expect.objectContaining({
        name: "carriage.stroke.position",
        direction: "feedback",
        unit: "metre",
      }),
    ]);
  });

  it("answers 404 for a Pantin that does not exist", async () => {
    const response = await sendRaw(server, "GET", "/api/pantins/missing/signals");
    expect(response.status).toBe(404);
  });
});
