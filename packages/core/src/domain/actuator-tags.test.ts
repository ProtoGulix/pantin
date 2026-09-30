import type { Joint, PantinDocument } from "@pantin/protocol";
import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { deleteJointFromDocument } from "./joint-rules.ts";
import { commandTagOf, describeTags, renamedTags } from "./tags.ts";

// Tags with drives and actuators (ADR 0028 point 9): tags live on drives, and
// a joint's setpoint exists only while no actuator moves it.

function body(id: string) {
  return {
    id,
    name: id,
    assembly: "press",
    source: {
      fileName: "press.stl",
      format: "stl" as const,
      unit: "mm" as const,
      upAxis: "z" as const,
      nodes: [],
    },
    mesh: `meshes/${id}.stl`,
  };
}

function slide(id: string, child: string): Joint {
  return {
    id,
    tagKey: id,
    name: id,
    type: "prismatic",
    parent: "frame",
    child,
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  };
}

const PRESS: PantinDocument = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [{ key: "press", name: "Press" }],
  bodies: ["frame", "rod-l", "rod-r", "rod-3"].map(body),
  joints: [slide("left", "rod-l"), slide("right", "rod-r"), slide("third", "rod-3")],
  drives: [
    { id: "valve", tagKey: "valve", name: "Valve", assembly: "press", type: "valve_5_3_closed" },
  ],
  actuators: [
    {
      id: "cylinder",
      name: "Cylinder",
      assembly: "press",
      type: "double_acting_cylinder",
      extendSpeed: 0.2,
      retractSpeed: 0.2,
      feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
      joints: ["left", "right"],
    },
  ],
  sensors: [],
};

const runtime = {
  jointPositions: new Map([["left", 0.05]]),
  setpoints: new Map(),
  driveCommands: new Map([["valve", { coil_14: 1 }]]),
  driveFeedback: new Map(),
  sensorOutputs: new Map(),
};

describe("tags with drives and actuators", () => {
  it("gives a moved joint its position only, the drive its command bits, the actuator nothing", () => {
    expect(
      describeTags(PRESS, runtime).map(({ name, type, value }) => [name, type, value]),
    ).toEqual([
      ["press.left.position", "float", 0.05],
      ["press.right.position", "float", 0],
      ["press.third.setpoint", "float", 0],
      ["press.third.position", "float", 0],
      ["press.valve.coil_14", "bit", 1],
      ["press.valve.coil_12", "bit", 0],
    ]);
  });

  it("gives a joint its setpoint back when its actuator no longer moves it", () => {
    const released = { ...PRESS, actuators: PRESS.actuators.map((a) => ({ ...a, joints: [] })) };
    const names = describeTags(released, runtime).map(({ name }) => name);
    expect(names).toContain("press.left.setpoint");
  });

  it("finds a drive's command, and refuses the setpoint of a moved joint", () => {
    expect(commandTagOf(PRESS, "press.valve.coil_12")).toMatchObject({
      member: "coil_12",
      type: "bit",
    });
    expect(() => commandTagOf(PRESS, "press.left.setpoint")).toThrow(
      'Joint "left" is moved by actuator "cylinder", fed by drive "valve": write "press.valve.coil_14", "press.valve.coil_12" instead.',
    );
  });

  it("says when the actuator that moves the joint has no feed", () => {
    const unfed = { ...PRESS, actuators: PRESS.actuators.map((a) => ({ ...a, feed: undefined })) };
    expect(() => commandTagOf(unfed, "press.left.setpoint")).toThrow(
      /which has no drive feeding it/,
    );
  });

  it("pairs renamed tags by owner and member, drives included", () => {
    const renamed = {
      ...PRESS,
      drives: PRESS.drives.map((drive) => ({ ...drive, tagKey: "distributor" })),
    };
    expect(renamedTags(PRESS, renamed)).toEqual([
      { from: "press.valve.coil_14", to: "press.distributor.coil_14" },
      { from: "press.valve.coil_12", to: "press.distributor.coil_12" },
    ]);
  });
});

describe("joint deletion and actuators", () => {
  it("refuses to delete a moved joint, naming its actuator", () => {
    expect(() => deleteJointFromDocument(PRESS, "left")).toThrow(
      'Joint "left" is moved by actuator "cylinder". Remove it from the actuator, or delete the actuator, first.',
    );
    expect(deleteJointFromDocument(PRESS, "third").joints.map((joint) => joint.id)).toEqual([
      "left",
      "right",
    ]);
  });
});
