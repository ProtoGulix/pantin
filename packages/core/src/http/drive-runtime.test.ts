import { FaultsResponseSchema, TagListResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CylinderAxis, startCylinderAxis, VALVE } from "../test-support/cylinder-axis.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Drive edits leave no stale runtime state behind (ADR 0022 points 7 and 8),
// and the drive routes answer the usual status codes.

let axis: CylinderAxis;

beforeEach(async () => {
  axis = await startCylinderAxis();
});

afterEach(async () => {
  await axis.close();
});

const request = (method: string, path: string, body?: unknown) =>
  sendJsonRequest(axis.server, method, `/api/pantins/axis${path}`, body);

async function faults() {
  return FaultsResponseSchema.parse(
    (await sendRaw(axis.server, "GET", "/api/pantins/axis/faults")).json,
  );
}

describe("runtime state after drive edits", () => {
  it("forgets the commands of a drive whose type changes", async () => {
    await axis.writeTag("carriage.valve.extend", 1);
    axis.runSeconds(0.1);
    await request("PATCH", "/drives/valve", { ...VALVE, type: "single_acting_cylinder" });
    // With "extend" forgotten, the spring brings the rod back.
    axis.runSeconds(0.6);
    expect(await axis.strokePosition()).toBe(0);
  });

  it("forgets the setpoint of a joint while a drive moves it", async () => {
    await request("DELETE", "/drives/valve");
    await axis.writeTag("carriage.stroke.setpoint", 0.05);
    axis.runSeconds(0.1);
    await request("POST", "/drives", VALVE);
    await request("DELETE", "/drives/valve");
    const tags = TagListResponseSchema.parse(
      (await sendRaw(axis.server, "GET", "/api/pantins/axis/tags")).json,
    ).tags;
    expect(tags.find((tag) => tag.name === "carriage.stroke.setpoint")?.value).toBe(0);
  });

  it("drops the fault of a deleted drive, and of a deleted joint", async () => {
    await request("PUT", "/drives/valve/fault", { fault: "unresponsive" });
    await request("DELETE", "/drives/valve");
    await request("PUT", "/joints/stroke/fault", { fault: "jammed" });
    await request("DELETE", "/joints/stroke");
    expect(await faults()).toEqual({ jammedJoints: [], unresponsiveDrives: [] });
  });

  it("holds the rod in mid-stroke when the coil falls, having no spring", async () => {
    await axis.writeTag("carriage.valve.extend", 1);
    axis.runSeconds(0.25);
    await axis.writeTag("carriage.valve.extend", 0);
    const stopped = await axis.strokePosition();
    axis.runSeconds(0.5);
    expect(await axis.strokePosition()).toBe(stopped);
    expect(stopped).toBeCloseTo(0.05, 2);
  });
});

describe("drive route status codes", () => {
  it.each([
    ["PATCH", "/drives/ghost", VALVE],
    ["DELETE", "/drives/ghost", undefined],
    ["PUT", "/drives/ghost/fault", { fault: "unresponsive" }],
    ["PUT", "/drives/ghost/tag-key", { tagKey: "x" }],
    ["PUT", "/joints/ghost/fault", { fault: "jammed" }],
  ])("answers 404 for %s %s", async (method, path, body) => {
    expect((await request(method, path, body)).status).toBe(404);
  });

  it("answers 400 for a drive on an unknown joint or with a bad speed", async () => {
    expect((await request("POST", "/drives", { ...VALVE, joints: ["ghost"] })).status).toBe(400);
    expect((await request("POST", "/drives", { ...VALVE, speed: -1 })).status).toBe(400);
  });

  it("answers 400 for a second drive on a joint already driven", async () => {
    const second = { ...VALVE, name: "Second" };
    const response = await request("POST", "/drives", second);
    expect(response.status).toBe(400);
    expect(response.body).toContain("already moved by drive");
  });
});
