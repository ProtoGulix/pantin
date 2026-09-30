import { FaultsResponseSchema, TagListResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CYLINDER,
  type CylinderAxis,
  MIGRATED_ACTUATOR_ID,
  startCylinderAxis,
  VALVE,
} from "../test-support/cylinder-axis.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Drive and actuator edits leave no stale runtime state behind (ADR 0022
// points 7 and 8, ADR 0028), and their routes answer the usual status codes.

let axis: CylinderAxis;

beforeEach(async () => {
  axis = await startCylinderAxis();
});

afterEach(async () => {
  await axis.close();
});

const request = (method: string, path: string, body?: unknown) =>
  sendJsonRequest(axis.server, method, `/api/pantins/axis${path}`, body);
const ACTUATOR = `/actuators/${MIGRATED_ACTUATOR_ID}`;

async function faults() {
  return FaultsResponseSchema.parse(
    (await sendRaw(axis.server, "GET", "/api/pantins/axis/faults")).json,
  );
}

describe("runtime state after drive edits", () => {
  it("forgets the commands of a drive whose type changes", async () => {
    await axis.writeTag("carriage.valve.coil_14", 1);
    axis.runSeconds(0.1);
    await request("PATCH", "/drives/valve", { ...VALVE, type: "valve_5_2_single" });
    // With coil_14 forgotten, the 5/2 valve's spring sends the rod back.
    axis.runSeconds(0.6);
    expect(await axis.strokePosition()).toBe(0);
  });

  it("forgets the setpoint of a joint while an actuator moves it", async () => {
    await request("DELETE", ACTUATOR);
    await axis.writeTag("carriage.stroke.setpoint", 0.05);
    axis.runSeconds(0.1);
    await request("POST", "/actuators", CYLINDER);
    await request("DELETE", "/actuators/cylinder");
    const tags = TagListResponseSchema.parse(
      (await sendRaw(axis.server, "GET", "/api/pantins/axis/tags")).json,
    ).tags;
    expect(tags.find((tag) => tag.name === "carriage.stroke.setpoint")?.value).toBe(0);
  });

  it("drops the fault of a deleted drive, and of a deleted joint", async () => {
    await request("PUT", "/drives/valve/fault", { fault: "unresponsive" });
    await request("DELETE", ACTUATOR);
    await request("DELETE", "/drives/valve");
    await request("PUT", "/joints/stroke/fault", { fault: "jammed" });
    await request("DELETE", "/joints/stroke");
    expect(await faults()).toEqual({ jammedJoints: [], unresponsiveDrives: [] });
  });

  it("holds the rod in mid-stroke when the coil falls, having no spring", async () => {
    await axis.writeTag("carriage.valve.coil_14", 1);
    axis.runSeconds(0.25);
    await axis.writeTag("carriage.valve.coil_14", 0);
    const stopped = await axis.strokePosition();
    axis.runSeconds(0.5);
    expect(await axis.strokePosition()).toBe(stopped);
    expect(stopped).toBeCloseTo(0.05, 2);
  });
});

describe("drive and actuator route status codes", () => {
  it.each([
    ["PATCH", "/drives/ghost", VALVE],
    ["DELETE", "/drives/ghost", undefined],
    ["PUT", "/drives/ghost/fault", { fault: "unresponsive" }],
    ["PUT", "/drives/ghost/tag-key", { tagKey: "x" }],
    ["PUT", "/joints/ghost/fault", { fault: "jammed" }],
    ["PATCH", "/actuators/ghost", CYLINDER],
    ["DELETE", "/actuators/ghost", undefined],
  ])("answers 404 for %s %s", async (method, path, body) => {
    expect((await request(method, path, body)).status).toBe(404);
  });

  it("answers 400 for a bad drive, or an actuator on an unknown joint, drive or port", async () => {
    expect((await request("POST", "/drives", { ...VALVE, type: "warp_drive" })).status).toBe(400);
    const unknownJoint = await request("POST", "/actuators", { ...CYLINDER, joints: ["ghost"] });
    expect(unknownJoint.status).toBe(400);
    const feed = { drive: "ghost", ports: {} };
    expect((await request("POST", "/actuators", { ...CYLINDER, feed })).status).toBe(400);
    const badPort = { drive: "valve", ports: { cap: "port_4", rod: "port_9" } };
    expect((await request("POST", "/actuators", { ...CYLINDER, feed: badPort })).status).toBe(400);
    expect((await request("POST", "/actuators", { ...CYLINDER, extendSpeed: -1 })).status).toBe(
      400,
    );
  });

  it("answers 400 for a second actuator on a joint already moved", async () => {
    const response = await request("POST", "/actuators", { ...CYLINDER, name: "Second" });
    expect(response.status).toBe(400);
    expect(response.body).toContain("already moved by actuator");
  });

  it("creates an actuator with its id from its name, without joint, and replaces its feed on update", async () => {
    const created = await request("POST", "/actuators", { ...CYLINDER, joints: [] });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ actuator: { id: "cylinder", joints: [] } });
    const swapped = { drive: "valve", ports: { cap: "port_2", rod: "port_4" } };
    const updated = await request("PATCH", "/actuators/cylinder", {
      ...CYLINDER,
      joints: [],
      feed: swapped,
    });
    expect(updated.json).toMatchObject({ actuator: { feed: swapped } });
  });
});
