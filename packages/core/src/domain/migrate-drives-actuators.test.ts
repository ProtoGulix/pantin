import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { migratePantinDocument } from "./migrations.ts";
import { parsePantinDocument } from "./pantin-document.ts";

// Version 8 to 9 (ADR 0028 point 12): each drive of ADR 0022 becomes a drive
// and an actuator.

const SOURCE = { fileName: "a.stl", format: "stl", unit: "m", upAxis: "z", nodes: [] };

function body(id: string) {
  return { id, name: id, assembly: "main", source: SOURCE, mesh: `meshes/${id}.stl` };
}

function joint(id: string, type: string, child: string) {
  const limits = type === "continuous" ? {} : { limits: [0, 0.1] };
  return {
    id,
    tagKey: id,
    name: id,
    type,
    parent: "frame",
    child,
    origin: [0, 0, 0],
    axis: [0, 0, 1],
    ...limits,
  };
}

function v8(drives: unknown[]) {
  return {
    schema_version: 8,
    name: "Machine",
    assemblies: [{ key: "main", name: "main" }],
    bodies: ["frame", "rod", "shaft"].map(body),
    joints: [joint("stroke", "prismatic", "rod"), joint("spin", "continuous", "shaft")],
    drives,
    sensors: [],
  };
}

const named = { id: "drv", tagKey: "drv", name: "Drive", assembly: "main" };

// Only the lists the migration fills: a drive left untouched may be invalid.
const MigratedSchema = z.object({
  schema_version: z.number(),
  drives: z.array(z.unknown()),
  actuators: z.array(z.object({ id: z.string() }).passthrough()),
});

function migrated(drive: unknown) {
  const document = migratePantinDocument(v8([drive]), "p");
  return MigratedSchema.parse(document);
}

describe("migration of drives to version 9", () => {
  it("turns a double-acting cylinder into a 5/3 closed-centre valve and a cylinder", () => {
    const old = { ...named, type: "double_acting_cylinder", speed: 0.2, joints: ["stroke"] };
    const result = migrated(old);
    expect(result.schema_version).toBe(9);
    expect(result.drives).toEqual([{ ...named, type: "valve_5_3_closed" }]);
    expect(result.actuators).toEqual([
      {
        id: "drv-actuator",
        name: "Drive",
        assembly: "main",
        type: "double_acting_cylinder",
        extendSpeed: 0.2,
        retractSpeed: 0.2,
        feed: { drive: "drv", ports: { cap: "port_4", rod: "port_2" } },
        joints: ["stroke"],
      },
    ]);
  });

  it("turns a single-acting cylinder into a 3/2 valve fed through port_2", () => {
    const old = { ...named, type: "single_acting_cylinder", speed: 0.3, joints: ["stroke"] };
    const result = migrated(old);
    expect(result.drives).toEqual([{ ...named, type: "valve_3_2_single" }]);
    expect(result.actuators).toEqual([
      expect.objectContaining({
        type: "single_acting_cylinder",
        extendSpeed: 0.3,
        returnSpeed: 0.3,
        feed: { drive: "drv", ports: { cap: "port_2" } },
      }),
    ]);
  });
});

describe("migration of motors and servo axes to version 9", () => {
  it("turns a motor on and off into a variable speed drive with its ramp in percent of nominal", () => {
    const old = {
      ...named,
      type: "motor_on_off",
      nominalSpeed: 2,
      acceleration: 4,
      joints: ["spin"],
    };
    const result = migrated(old);
    // 4 units/s² of a 2 units/s motor: 2 nominal speeds per second, 200 %/s.
    expect(result.drives).toEqual([{ ...named, type: "vfd_on_off", acceleration: 200 }]);
    expect(result.actuators).toEqual([
      expect.objectContaining({
        type: "ac_motor",
        nominalSpeed: 2,
        feed: { drive: "drv", ports: { in: "out" } },
        joints: ["spin"],
      }),
    ]);
  });

  it("gives an analog motor a nominal speed of one unit per second", () => {
    const old = { ...named, type: "motor_analog", acceleration: 0.5, joints: ["spin"] };
    const result = migrated(old);
    expect(result.drives).toEqual([{ ...named, type: "vfd_analog", acceleration: 50 }]);
    expect(result.actuators).toEqual([
      expect.objectContaining({ type: "ac_motor", nominalSpeed: 1 }),
    ]);
  });

  it("turns a servo axis into a servo drive and a servo motor", () => {
    const old = {
      ...named,
      type: "servo_axis",
      maxSpeed: 0.5,
      maxAcceleration: 2,
      joints: ["stroke"],
    };
    const result = migrated(old);
    expect(result.drives).toEqual([
      { ...named, type: "servo_drive", maxSpeed: 0.5, maxAcceleration: 2 },
    ]);
    expect(result.actuators).toEqual([
      expect.objectContaining({
        type: "servo_motor",
        feed: { drive: "drv", ports: { in: "out" } },
        joints: ["stroke"],
      }),
    ]);
  });
});

describe("migration of drives to version 9, edge cases", () => {
  it("derives distinct actuator ids, even for a long drive id, and keeps the drive order", () => {
    const longId = "d".repeat(64);
    const first = {
      ...named,
      type: "servo_axis",
      maxSpeed: 1,
      maxAcceleration: 1,
      joints: ["stroke"],
    };
    const second = { ...first, id: longId, tagKey: longId, joints: [] };
    const document = MigratedSchema.parse(migratePantinDocument(v8([first, second]), "p"));
    const ids = document.actuators.map((actuator) => actuator.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id.length <= 64)).toBe(true);
    expect(ids[0]).toBe("drv-actuator");
  });

  it("leaves a drive it does not know, or with a missing field, to the schema", () => {
    const unknown = { ...named, type: "warp_drive", joints: [] };
    expect(migrated(unknown)).toMatchObject({ drives: [unknown], actuators: [] });
    const missing = { ...named, type: "double_acting_cylinder", joints: ["stroke"] };
    expect(migrated(missing)).toMatchObject({ drives: [missing], actuators: [] });
  });

  it.each([
    ["without joints", { ...named, type: "servo_axis", maxSpeed: 1, maxAcceleration: 1 }],
    [
      "with a non-string id",
      { ...named, id: 7, type: "servo_axis", maxSpeed: 1, maxAcceleration: 1, joints: [] },
    ],
    [
      "with a zero nominal speed",
      { ...named, type: "motor_on_off", nominalSpeed: 0, acceleration: 1, joints: [] },
    ],
  ])("leaves a drive %s untouched, for the schema to report", (_case, drive) => {
    expect(migrated(drive)).toMatchObject({ drives: [drive], actuators: [] });
  });

  it("produces documents the current schema accepts, for each old type", () => {
    const olds = [
      { type: "double_acting_cylinder", speed: 0.2, joints: ["stroke"] },
      { type: "single_acting_cylinder", speed: 0.2, joints: ["stroke"] },
      { type: "motor_on_off", nominalSpeed: 1, acceleration: 2, joints: ["spin"] },
      { type: "motor_analog", acceleration: 2, joints: ["spin"] },
      { type: "servo_axis", maxSpeed: 1, maxAcceleration: 2, joints: ["stroke"] },
    ];
    for (const old of olds) {
      const text = JSON.stringify(v8([{ ...named, ...old }]));
      const document = parsePantinDocument(text, "p/pantin.json");
      expect(document.schema_version).toBe(PANTIN_SCHEMA_VERSION);
      expect(document.actuators).toHaveLength(1);
    }
  });
});
