import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";

// Document rules of drives (ADR 0022 point 4).

function body(id: string) {
  return {
    id,
    name: id,
    assembly: "press",
    source: { fileName: "press.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

function joint(id: string, parent: string, child: string, type = "prismatic") {
  const limits = type === "fixed" || type === "continuous" ? {} : { limits: [0, 0.1] };
  return {
    id,
    tagKey: id,
    name: id,
    type,
    parent,
    child,
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    ...limits,
  };
}

const valve = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "press",
  joints: ["left", "right"],
  type: "double_acting_cylinder",
  speed: 0.2,
};

// Two cylinders on one valve, plus a fixed stop and a spindle.
const press = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [{ key: "press", name: "Press" }],
  bodies: ["frame", "rod-l", "rod-r", "stop", "spindle"].map(body),
  joints: [
    joint("left", "frame", "rod-l"),
    joint("right", "frame", "rod-r"),
    joint("stop", "frame", "stop", "fixed"),
    joint("spin", "frame", "spindle", "continuous"),
  ],
  drives: [valve],
  sensors: [],
};

function issuesOf(document: unknown): string[] {
  const parsed = PantinDocumentSchema.safeParse(document);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("PantinDocumentSchema drives", () => {
  it("accepts one drive moving two joints", () => {
    expect(issuesOf(press)).toEqual([]);
  });

  it.each([
    ["a fixed joint", { joints: ["stop"] }, /"stop", which is not a movable joint/],
    ["an unknown joint", { joints: ["ghost"] }, /"ghost", which is not a movable joint/],
    ["joints in metres and radians", { joints: ["left", "spin"] }, /metres and in radians/],
    ["an unknown assembly", { assembly: "ghost" }, /assembly "ghost", which does not exist/],
    ["a zero speed", { speed: 0 }, /greater than zero/],
    ["no joint", { joints: [] }, /at least one joint/],
    ["a joint listed twice", { joints: ["left", "left"] }, /each joint once/],
  ])("refuses a drive with %s", (_case, change, message) => {
    expect(issuesOf({ ...press, drives: [{ ...valve, ...change }] }).join(" ")).toMatch(message);
  });

  it("refuses a joint moved by two drives", () => {
    const second = { ...valve, id: "valve-2", tagKey: "valve-2", joints: ["left"] };
    expect(issuesOf({ ...press, drives: [valve, second] })).toContain(
      'Joint "left" is already moved by drive "valve"; a joint has one drive at most.',
    );
  });

  it("refuses two drives with the same id or the same tag key in one assembly", () => {
    const twin = { ...valve, joints: ["spin"], type: "motor_analog", acceleration: 1 };
    expect(issuesOf({ ...press, drives: [valve, twin] })).toEqual(
      expect.arrayContaining([
        'Drive id "valve" is used twice; drive ids must be unique.',
        'Tag key "valve" of drive "valve" is already used in assembly "press".',
      ]),
    );
  });

  it("refuses a drive whose tag key is a joint's in the same assembly", () => {
    const clash = { ...valve, tagKey: "left" };
    expect(issuesOf({ ...press, drives: [clash] })).toContain(
      'Tag key "left" of drive "valve" is already used in assembly "press".',
    );
  });
});
