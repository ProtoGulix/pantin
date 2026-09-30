import {
  DriveResponseSchema,
  FaultsResponseSchema,
  RenamedTagsResponseSchema,
  TagListResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CylinderAxis, startCylinderAxis, VALVE } from "../test-support/cylinder-axis.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Phase 4 exit criterion (CLAUDE.md 13.4, ADR 0022): a cylinder behaves as
// described, with or without spring return, driven by its tags over REST,
// without a viewer. The rod is the carriage, on a 100 mm stroke.

let axis: CylinderAxis;

beforeEach(async () => {
  axis = await startCylinderAxis();
});

afterEach(async () => {
  await axis.close();
});

const writeTag = (name: string, value: number) => axis.writeTag(name, value);
const strokePosition = () => axis.strokePosition();
const runSeconds = (seconds: number) => axis.runSeconds(seconds);

describe("double-acting cylinder over REST (phase 4 exit)", () => {
  it("extends, holds with no coil, retracts, and holds with both coils", async () => {
    await writeTag("carriage.valve.extend", 1);
    runSeconds(0.6);
    expect(await strokePosition()).toBe(0.1);
    await writeTag("carriage.valve.extend", 0);
    runSeconds(0.3);
    expect(await strokePosition()).toBe(0.1);
    await writeTag("carriage.valve.retract", 1);
    runSeconds(0.25);
    const halfway = await strokePosition();
    expect(halfway).toBeCloseTo(0.05, 2);
    await writeTag("carriage.valve.extend", 1);
    runSeconds(0.3);
    expect(await strokePosition()).toBe(halfway);
  });

  it("lists its command bits, and refuses a bit that is not 0 or 1", async () => {
    const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/tags");
    expect(TagListResponseSchema.parse(response.json).tags.map((tag) => tag.name)).toEqual([
      "carriage.stroke.position",
      "carriage.valve.extend",
      "carriage.valve.retract",
    ]);
    expect((await writeTag("carriage.valve.extend", 2)).status).toBe(400);
  });
});

describe("single-acting cylinder over REST (phase 4 exit)", () => {
  it("extends with its coil and returns on its spring when the coil falls", async () => {
    const patch = { ...VALVE, type: "single_acting_cylinder" };
    const changed = await sendJsonRequest(
      axis.server,
      "PATCH",
      "/api/pantins/axis/drives/valve",
      patch,
    );
    expect(DriveResponseSchema.parse(changed.json).drive).toMatchObject({
      id: "valve",
      tagKey: "valve",
    });
    await writeTag("carriage.valve.extend", 1);
    runSeconds(0.6);
    expect(await strokePosition()).toBe(0.1);
    await writeTag("carriage.valve.extend", 0);
    runSeconds(0.6);
    expect(await strokePosition()).toBe(0);
  });
});

describe("faults", () => {
  it("keeps a jammed joint in place, and lists the fault", async () => {
    const jammed = await sendJsonRequest(
      axis.server,
      "PUT",
      "/api/pantins/axis/joints/stroke/fault",
      {
        fault: "jammed",
      },
    );
    expect(FaultsResponseSchema.parse(jammed.json)).toEqual({
      jammedJoints: ["stroke"],
      unresponsiveDrives: [],
    });
    await writeTag("carriage.valve.extend", 1);
    runSeconds(0.6);
    expect(await strokePosition()).toBe(0);
  });

  it("runs an unresponsive drive on the commands it had when it failed", async () => {
    await writeTag("carriage.valve.extend", 1);
    await sendJsonRequest(axis.server, "PUT", "/api/pantins/axis/drives/valve/fault", {
      fault: "unresponsive",
    });
    await writeTag("carriage.valve.extend", 0);
    await writeTag("carriage.valve.retract", 1);
    runSeconds(0.6);
    expect(await strokePosition()).toBe(0.1);
  });
});

describe("drive edits", () => {
  it("refuses to delete a driven joint, and gives it its setpoint back once the drive is gone", async () => {
    const refused = await sendRaw(axis.server, "DELETE", "/api/pantins/axis/joints/stroke");
    expect(refused.status).toBe(409);
    await sendRaw(axis.server, "DELETE", "/api/pantins/axis/drives/valve");
    const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/tags");
    expect(TagListResponseSchema.parse(response.json).tags.map((tag) => tag.name)).toEqual([
      "carriage.stroke.setpoint",
      "carriage.stroke.position",
    ]);
  });

  it("renames a drive's tag key, reporting the renamed tags", async () => {
    const response = await sendJsonRequest(
      axis.server,
      "PUT",
      "/api/pantins/axis/drives/valve/tag-key",
      {
        tagKey: "distributeur",
      },
    );
    expect(RenamedTagsResponseSchema.parse(response.json).renamedTags).toEqual([
      { from: "carriage.valve.extend", to: "carriage.distributeur.extend" },
      { from: "carriage.valve.retract", to: "carriage.distributeur.retract" },
    ]);
  });
});
