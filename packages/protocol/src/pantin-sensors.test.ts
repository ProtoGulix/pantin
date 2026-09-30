import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";

// Document rules of sensors (ADR 0023 point 3).

function body(id: string) {
  return {
    id,
    name: id,
    assembly: "press",
    source: { fileName: "press.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

function joint(id: string, child: string, type = "prismatic") {
  const limits = type === "fixed" ? {} : { limits: [0, 0.1] };
  return {
    id,
    tagKey: id,
    name: id,
    type,
    parent: "frame",
    child,
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    ...limits,
  };
}

const extended = {
  id: "extended",
  tagKey: "extended",
  name: "Extended",
  assembly: "press",
  joint: "stroke",
  type: "position_switch",
  range: [0.098, 0.1],
  normallyClosed: false,
};

const encoder = {
  id: "encoder",
  tagKey: "encoder",
  name: "Encoder",
  assembly: "press",
  joint: "stroke",
  type: "encoder",
  pulsesPerUnit: 1000,
};

const valve = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "press",
  joints: ["stroke"],
  type: "double_acting_cylinder",
  speed: 0.2,
};

// A cylinder with its valve, a switch and an encoder, plus a fixed stop.
const press = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [{ key: "press", name: "Press" }],
  bodies: ["frame", "rod", "stop"].map(body),
  joints: [joint("stroke", "rod"), joint("stop", "stop", "fixed")],
  drives: [valve],
  sensors: [extended, encoder],
};

function issuesOf(document: unknown): string[] {
  const parsed = PantinDocumentSchema.safeParse(document);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("PantinDocumentSchema sensors", () => {
  it("accepts a switch and an encoder on one driven joint", () => {
    expect(issuesOf(press)).toEqual([]);
  });

  it.each([
    ["a fixed joint", { joint: "stop" }, /"stop", which is not a movable joint/],
    ["an unknown joint", { joint: "ghost" }, /"ghost", which is not a movable joint/],
    ["an unknown assembly", { assembly: "ghost" }, /assembly "ghost", which does not exist/],
    ["reversed bounds", { range: [0.1, 0] }, /lower bound must not exceed/],
    ["an unknown type", { type: "radar" }, /Expected .position_switch. | .encoder./],
  ])("refuses a sensor on %s", (_case, change, message) => {
    const sensors = [{ ...extended, ...change }];
    expect(issuesOf({ ...press, sensors }).join(" ")).toMatch(message);
  });

  it("refuses two sensors with the same id or the same tag key in one assembly", () => {
    const twin = { ...encoder, id: "extended", tagKey: "extended" };
    expect(issuesOf({ ...press, sensors: [extended, twin] })).toEqual(
      expect.arrayContaining([
        'Sensor id "extended" is used twice; sensor ids must be unique.',
        'Tag key "extended" of sensor "extended" is already used in assembly "press".',
      ]),
    );
  });

  it("refuses a sensor whose tag key is a joint's or a drive's in the same assembly", () => {
    const sensors = [
      { ...extended, tagKey: "stroke" },
      { ...encoder, tagKey: "valve" },
    ];
    expect(issuesOf({ ...press, sensors })).toEqual([
      'Tag key "stroke" of sensor "extended" is already used in assembly "press".',
      'Tag key "valve" of sensor "encoder" is already used in assembly "press".',
    ]);
  });

  it("refuses a document without its sensor list", () => {
    const { sensors: _sensors, ...withoutSensors } = press;
    expect(issuesOf(withoutSensors)).not.toEqual([]);
  });
});

describe("PantinDocumentSchema sensor placement", () => {
  it("refuses a switch its joint's stroke cannot hold, naming both (ADR 0026)", () => {
    const retracted = {
      ...extended,
      id: "retracted",
      tagKey: "retracted",
      type: "inductive_switch",
      facePosition: 0.002,
      nominalDistance: 0.005,
      material: "steel",
      hysteresisPercent: 10,
    };
    const { range: _range, ...inductive } = retracted;
    expect(issuesOf({ ...press, sensors: [inductive] })).toEqual([
      expect.stringMatching(/^Sensor "retracted" on joint "stroke": The face is inside the stroke/),
    ]);
    expect(issuesOf({ ...press, sensors: [{ ...inductive, facePosition: 0 }] })).toEqual([]);
  });
});
