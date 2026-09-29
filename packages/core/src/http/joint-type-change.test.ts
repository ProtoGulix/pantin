import { JointResponseSchema } from "@pantin/protocol";
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

// ADR 0018: PATCH may change a joint's type; the id stays, and the runtime
// state follows the new type.

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

const PRISMATIC = {
  type: "prismatic",
  name: "Axe X",
  parent: "rail",
  child: "carriage",
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 0.8],
};

const { limits: _limits, ...FIXED_FIELDS } = PRISMATIC;
const FIXED = { ...FIXED_FIELDS, type: "fixed" };

function patchJoint(body: object): Promise<RawResponse> {
  return sendJsonRequest(server, "PATCH", "/api/pantins/axis/joints/axe-x", body);
}

describe("joint type change", () => {
  it("changes a fixed joint into a slider, keeping its id (ADR 0018)", async () => {
    await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", FIXED);
    const response = await patchJoint(PRISMATIC);
    expect(response.status).toBe(200);
    expect(JointResponseSchema.parse(response.json).joint).toEqual({ id: "axe-x", ...PRISMATIC });
    const moved = await sendJsonRequest(server, "PUT", "/api/pantins/axis/joints/axe-x/position", {
      position: 0.3,
    });
    expect(moved.status).toBe(200);
  });

  it("drops the position and the setpoint of a slider that becomes fixed", async () => {
    await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", PRISMATIC);
    await sendJsonRequest(server, "PUT", "/api/pantins/axis/joints/axe-x/position", {
      position: 0.3,
    });
    await sendJsonRequest(server, "PUT", "/api/pantins/axis/tags/axe-x.setpoint", { value: 0.5 });
    await patchJoint(FIXED);
    const tags = await sendRaw(server, "GET", "/api/pantins/axis/tags");
    expect(tags.json).toMatchObject({ tags: [] });
    // Back to a slider: it starts over from 0, with no setpoint left over.
    await patchJoint(PRISMATIC);
    const again = await sendRaw(server, "GET", "/api/pantins/axis/tags");
    expect(again.json).toMatchObject({
      tags: [
        { name: "axe-x.setpoint", value: 0 },
        { name: "axe-x.position", value: 0 },
      ],
    });
  });
});
