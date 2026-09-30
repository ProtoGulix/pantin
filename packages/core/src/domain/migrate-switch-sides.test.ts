import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { migratePantinDocument } from "./migrations.ts";

// Migration to version 8 (ADR 0026 point 5), through migratePantinDocument.

const rail = {
  id: "rail",
  name: "Rail",
  assembly: "main",
  source: { fileName: "rail.stl", format: "stl", unit: "mm", upAxis: "z", nodes: [] },
  mesh: "meshes/rail.stl",
};

// The Pantin "test2": a 125 mm cylinder with an inductive sensor whose face
// was inside the stroke, and a limit switch short of its end.
const cylinder = {
  id: "stroke",
  tagKey: "stroke",
  name: "Stroke",
  type: "prismatic",
  parent: "rail",
  child: "rod",
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 0.125],
};
const common = { name: "Switch", assembly: "main", joint: "stroke", normallyClosed: false };
const v7 = {
  schema_version: 7,
  name: "test2",
  assemblies: [{ key: "main", name: "main" }],
  bodies: [rail, { ...rail, id: "rod", name: "Rod", mesh: "meshes/rod.stl" }],
  drives: [],
  joints: [cylinder],
  sensors: [
    {
      ...common,
      id: "min",
      tagKey: "min",
      type: "inductive_switch",
      facePosition: 0.002,
      approach: "increasing",
      nominalDistance: 0.005,
      material: "steel",
      hysteresisPercent: 1,
    },
    {
      ...common,
      id: "max",
      tagKey: "max",
      type: "limit_switch",
      operatingPosition: 0.12,
      actuation: "increasing",
      differentialTravel: 0.0005,
      overtravel: 0.002,
    },
  ],
};

describe("migratePantinDocument to version 8 (ADR 0026)", () => {
  it("drops the direction fields, moves a face out of the stroke and stretches a short overtravel", () => {
    const migrated = migratePantinDocument(v7, "p");
    expect(migrated).toMatchObject({ schema_version: PANTIN_SCHEMA_VERSION });
    const [min, max] = Reflect.get(Object(migrated), "sensors");
    expect(min).toEqual({ ...v7.sensors[0], approach: undefined, facePosition: 0 });
    expect(Object.keys(min)).not.toContain("approach");
    expect(Object.keys(max)).not.toContain("actuation");
    expect(max.overtravel).toBeCloseTo(0.005, 12);
    expect(PantinDocumentSchema.safeParse(migrated).error?.issues).toBeUndefined();
  });

  it("keeps the old on zone of a limit switch whose side would change, as an ideal switch", () => {
    // Pressed forwards at 20 mm: on from 20 mm to the upper end, though nearer the lower one.
    const early = { ...v7.sensors[1], operatingPosition: 0.02 };
    const migrated = migratePantinDocument({ ...v7, sensors: [early] }, "p");
    expect(Reflect.get(Object(migrated), "sensors")).toEqual([
      { ...common, id: "max", tagKey: "max", type: "position_switch", range: [0.02, 0.125] },
    ]);
    expect(PantinDocumentSchema.safeParse(migrated).success).toBe(true);
  });

  it("turns the one-sided switches of a continuous joint into ideal switches over their drawn zone", () => {
    const { limits: _limits, ...wheel } = { ...cylinder, type: "continuous" };
    const migrated = migratePantinDocument({ ...v7, joints: [wheel] }, "p");
    const [min, max] = Reflect.get(Object(migrated), "sensors");
    expect(min).toMatchObject({ type: "position_switch", range: [-0.003, 0.002] });
    expect(max).toMatchObject({ type: "position_switch", range: [0.12, 0.122] });
    expect(PantinDocumentSchema.safeParse(migrated).success).toBe(true);
  });

  it.each([
    ["at mid-stroke", { operatingPosition: 0.0625 }, [0, 0.125], [0.0625, 0.125]],
    ["outside the stroke", { operatingPosition: 0.2 }, [0, 0.125], [0.2, 0.202]],
    ["on a zero-length stroke", { operatingPosition: 0.05 }, [0.05, 0.05], [0.05, 0.05]],
  ])(
    "turns a limit switch %s into an ideal switch the document accepts",
    (_case, change, limits, range) => {
      const joints = [{ ...cylinder, limits }];
      const sensors = [{ ...v7.sensors[1], ...change }];
      const migrated = migratePantinDocument({ ...v7, joints, sensors }, "p");
      expect(Reflect.get(Object(migrated), "sensors")).toEqual([
        { ...common, id: "max", tagKey: "max", type: "position_switch", range },
      ]);
      expect(PantinDocumentSchema.safeParse(migrated).error?.issues).toBeUndefined();
    },
  );
});
