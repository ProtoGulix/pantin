import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";

// Document rules of actuators (ADR 0028 point 9).

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

function drive(id: string, type: string, extra = {}) {
  return { id, tagKey: id, name: id, assembly: "press", type, ...extra };
}

const cylinder = {
  id: "cylinder",
  name: "Cylinder",
  assembly: "press",
  type: "double_acting_cylinder",
  extendSpeed: 0.2,
  retractSpeed: 0.3,
  feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
  joints: ["left", "right"],
};

// Two rods on one cylinder, plus a fixed stop and a spindle.
const press = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [
    { key: "press", name: "Press", placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
  ],
  bodies: ["frame", "rod-l", "rod-r", "stop", "spindle"].map(body),
  joints: [
    joint("left", "frame", "rod-l"),
    joint("right", "frame", "rod-r"),
    joint("stop", "frame", "stop", "fixed"),
    joint("spin", "frame", "spindle", "continuous"),
  ],
  drives: [
    drive("valve", "valve_5_3_closed"),
    drive("three-two", "valve_3_2_single"),
    drive("vfd", "vfd_analog", { acceleration: 50 }),
    drive("servo", "servo_drive", { maxSpeed: 1, maxAcceleration: 2 }),
  ],
  actuators: [cylinder],
  sensors: [],
};

function issuesOf(actuators: unknown[], document = press): string[] {
  const parsed = PantinDocumentSchema.safeParse({ ...document, actuators });
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("PantinDocumentSchema actuators", () => {
  it("accepts one actuator moving two joints, and one moving none or without feed", () => {
    expect(issuesOf([cylinder])).toEqual([]);
    expect(issuesOf([{ ...cylinder, joints: [] }])).toEqual([]);
    expect(issuesOf([{ ...cylinder, feed: undefined }])).toEqual([]);
  });

  it("accepts a double-acting cylinder on a 5/2 valve and a motor on a variable speed drive", () => {
    const motor = {
      id: "motor",
      name: "Motor",
      assembly: "press",
      type: "ac_motor",
      nominalSpeed: 2,
      feed: { drive: "vfd", ports: { in: "out" } },
      joints: ["spin"],
    };
    expect(issuesOf([cylinder, motor])).toEqual([]);
  });

  it.each([
    ["a fixed joint", { joints: ["stop"] }, /"stop", which is not a movable joint/],
    ["an unknown joint", { joints: ["ghost"] }, /"ghost", which is not a movable joint/],
    ["joints in metres and radians", { joints: ["left", "spin"] }, /metres and in radians/],
    ["an unknown assembly", { assembly: "ghost" }, /assembly "ghost", which does not exist/],
    ["a zero speed", { extendSpeed: 0 }, /greater than zero/],
    ["a joint listed twice", { joints: ["left", "left"] }, /each joint once/],
    ["an unknown drive", { feed: { drive: "ghost", ports: {} } }, /fed by drive "ghost"/],
    [
      "an input port left unfed",
      { feed: { drive: "valve", ports: { cap: "port_4" } } },
      /no source for its port "rod"/,
    ],
    [
      "an output port the drive lacks",
      { feed: { drive: "valve", ports: { cap: "port_4", rod: "port_9" } } },
      /"port_9", which drive "valve" does not have/,
    ],
    [
      "a port of another domain",
      { feed: { drive: "vfd", ports: { cap: "out", rod: "out" } } },
      /the domains must match/,
    ],
    [
      "a port that is not one of its own",
      { feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2", tail: "port_2" } } },
      /"tail", which is not one of its ports/,
    ],
  ])("refuses an actuator with %s", (_case, change, message) => {
    expect(issuesOf([{ ...cylinder, ...change }]).join(" ")).toMatch(message);
  });
});

describe("PantinDocumentSchema actuators, wiring and joints", () => {
  it("refuses a double-acting cylinder fed by a 3/2 valve alone", () => {
    const feed = { drive: "three-two", ports: { cap: "port_2", rod: "port_4" } };
    expect(issuesOf([{ ...cylinder, feed }]).join(" ")).toMatch(/"port_4", which drive/);
  });

  it.each([
    ["a 3/2 valve", "three-two", "port_2"],
    ["a 5/3 valve", "valve", "port_4"],
  ])("refuses a feed that reads one port of %s for both chambers", (_case, drive, port) => {
    const feed = { drive, ports: { cap: port, rod: port } };
    expect(issuesOf([{ ...cylinder, feed }]).join(" ")).toMatch(
      /reads "port_\d" of drive .* for ports "cap", "rod"; each output port can feed only one input port/,
    );
  });

  it("refuses a joint moved by two actuators", () => {
    const second = { ...cylinder, id: "second", joints: ["left"] };
    expect(issuesOf([cylinder, second])).toContain(
      'Joint "left" is already moved by actuator "cylinder"; a joint has one actuator at most.',
    );
  });

  it("refuses two actuators with the same id", () => {
    expect(issuesOf([cylinder, { ...cylinder, joints: [] }])).toContain(
      'Actuator id "cylinder" is used twice; actuator ids must be unique.',
    );
  });

  it("accepts one drive port feeding two actuators", () => {
    const second = { ...cylinder, id: "second", joints: [] };
    expect(issuesOf([cylinder, second])).toEqual([]);
  });

  it("refuses a servo drive whose actuators move joints of two units", () => {
    const servo = (id: string, joints: string[]) => ({
      id,
      name: id,
      assembly: "press",
      type: "servo_motor",
      feed: { drive: "servo", ports: { in: "out" } },
      joints,
    });
    expect(issuesOf([servo("a", ["left"]), servo("b", ["right"])])).toEqual([]);
    expect(issuesOf([servo("a", ["left"]), servo("b", ["spin"])]).join(" ")).toMatch(
      /Servo drive "servo" feeds actuators that move joints in metres and in radians/,
    );
  });
});
