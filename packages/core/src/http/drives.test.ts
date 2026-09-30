import {
  FaultsResponseSchema,
  PantinResponseSchema,
  RenamedTagsResponseSchema,
  TagListResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CylinderAxis,
  MIGRATED_ACTUATOR_ID,
  OLD_DRIVE,
  startCylinderAxis,
} from "../test-support/cylinder-axis.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Phase 4 exit criterion (CLAUDE.md 13.4, ADR 0022, 0028): a cylinder behaves
// as described, with or without spring return, driven by its tags over REST,
// without a viewer. The Pantin is a version 8 document, opened through the
// migration to version 9: same positions and timings as before, under the new
// tag members (extend is coil_14, retract is coil_12). The rod is the
// carriage, on a 100 mm stroke.

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

describe("double-acting cylinder over REST, through the migration (phase 4 exit)", () => {
  it("opens as a 5/3 closed-centre valve feeding a double-acting cylinder", async () => {
    const opened = await sendRaw(axis.server, "GET", "/api/pantins/axis");
    const { document } = PantinResponseSchema.parse(opened.json);
    expect(document.drives).toEqual([
      {
        id: "valve",
        tagKey: "valve",
        name: "Valve",
        assembly: "carriage",
        type: "valve_5_3_closed",
      },
    ]);
    expect(document.actuators).toEqual([
      {
        id: MIGRATED_ACTUATOR_ID,
        name: "Valve",
        assembly: "carriage",
        type: "double_acting_cylinder",
        extendSpeed: 0.2,
        retractSpeed: 0.2,
        feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
        joints: ["stroke"],
      },
    ]);
  });

  it("extends, holds with no coil, and retracts", async () => {
    await writeTag("carriage.valve.coil_14", 1);
    runSeconds(0.6);
    expect(await strokePosition()).toBe(0.1);
    await writeTag("carriage.valve.coil_14", 0);
    runSeconds(0.3);
    expect(await strokePosition()).toBe(0.1);
    await writeTag("carriage.valve.coil_12", 1);
    runSeconds(0.25);
    const halfway = await strokePosition();
    expect(halfway).toBeCloseTo(0.05, 2);
  });
});

describe("both coils over REST, through the migration", () => {
  it("holds at rest with both coils, and goes on moving when the second coil rises mid-stroke", async () => {
    await writeTag("carriage.valve.coil_14", 1);
    await writeTag("carriage.valve.coil_12", 1);
    runSeconds(0.3);
    expect(await strokePosition()).toBe(0);
    await writeTag("carriage.valve.coil_12", 0);
    runSeconds(0.25);
    // The one difference of ADR 0028 point 12: a 5/3 valve keeps its spool
    // with both coils set, where the fused drive of ADR 0022 stopped.
    await writeTag("carriage.valve.coil_12", 1);
    runSeconds(0.5);
    expect(await strokePosition()).toBe(0.1);
  });

  it("lists its command bits, and refuses a bit that is not 0 or 1", async () => {
    const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/tags");
    expect(TagListResponseSchema.parse(response.json).tags.map((tag) => tag.name)).toEqual([
      "carriage.stroke.position",
      "carriage.valve.coil_14",
      "carriage.valve.coil_12",
    ]);
    expect((await writeTag("carriage.valve.coil_14", 2)).status).toBe(400);
  });
});

describe("single-acting cylinder over REST, through the migration (phase 4 exit)", () => {
  it("extends with its coil and returns on its spring when the coil falls", async () => {
    const old = { ...OLD_DRIVE, type: "single_acting_cylinder" };
    const single = await startCylinderAxis({ oldDrive: old });
    try {
      const opened = await sendRaw(single.server, "GET", "/api/pantins/axis");
      const { document } = PantinResponseSchema.parse(opened.json);
      expect(document.drives).toMatchObject([{ id: "valve", type: "valve_3_2_single" }]);
      expect(document.actuators).toMatchObject([
        { type: "single_acting_cylinder", extendSpeed: 0.2, returnSpeed: 0.2 },
      ]);
      await single.writeTag("carriage.valve.coil_12", 1);
      single.runSeconds(0.6);
      expect(await single.strokePosition()).toBe(0.1);
      await single.writeTag("carriage.valve.coil_12", 0);
      single.runSeconds(0.6);
      expect(await single.strokePosition()).toBe(0);
    } finally {
      await single.close();
    }
  });
});

describe("motor over REST, through the migration", () => {
  // A 0.5 m/s nominal motor on a 1 m/s^2 ramp, on the prismatic stroke
  // (0.1 m limit): the speed and the ramp in joint units are those of ADR 0022.
  it("ramps to its nominal speed at its acceleration, as before", async () => {
    const old = {
      ...OLD_DRIVE,
      type: "motor_on_off",
      nominalSpeed: 0.5,
      acceleration: 1,
    };
    const motor = await startCylinderAxis({ oldDrive: old });
    try {
      await motor.writeTag("carriage.valve.run", 1);
      motor.runSeconds(0.25);
      // Constant acceleration from rest: a * t^2 / 2 = 0.03125 m after 0.25 s.
      expect(await motor.strokePosition()).toBeCloseTo(0.03125, 2);
      motor.runSeconds(2);
      // Then 0.5 m/s until the rod stops against its 0.1 m limit.
      expect(await motor.strokePosition()).toBe(0.1);
    } finally {
      await motor.close();
    }
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
    await writeTag("carriage.valve.coil_14", 1);
    runSeconds(0.6);
    expect(await strokePosition()).toBe(0);
  });

  it("freezes an unresponsive drive on the port states it had when it failed", async () => {
    await writeTag("carriage.valve.coil_14", 1);
    runSeconds(1 / 120);
    await sendJsonRequest(axis.server, "PUT", "/api/pantins/axis/drives/valve/fault", {
      fault: "unresponsive",
    });
    await writeTag("carriage.valve.coil_14", 0);
    await writeTag("carriage.valve.coil_12", 1);
    runSeconds(0.6);
    expect(await strokePosition()).toBe(0.1);
  });
});

describe("drive and actuator edits", () => {
  it("refuses to delete a moved joint or a feeding drive, and gives the joint its setpoint back once the actuator is gone", async () => {
    const joint = await sendRaw(axis.server, "DELETE", "/api/pantins/axis/joints/stroke");
    expect(joint.status).toBe(409);
    const drive = await sendRaw(axis.server, "DELETE", "/api/pantins/axis/drives/valve");
    expect(drive.status).toBe(409);
    expect(drive.body).toContain("feeds actuator");
    const path = `/api/pantins/axis/actuators/${MIGRATED_ACTUATOR_ID}`;
    expect((await sendRaw(axis.server, "DELETE", path)).status).toBe(200);
    const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/tags");
    expect(TagListResponseSchema.parse(response.json).tags.map((tag) => tag.name)).toEqual([
      "carriage.stroke.setpoint",
      "carriage.stroke.position",
      "carriage.valve.coil_14",
      "carriage.valve.coil_12",
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
      { from: "carriage.valve.coil_14", to: "carriage.distributeur.coil_14" },
      { from: "carriage.valve.coil_12", to: "carriage.distributeur.coil_12" },
    ]);
  });
});
