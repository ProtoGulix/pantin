import { type Joint, PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { type SimulationState, stepSimulation } from "./drive-step.ts";
import { STEP_SECONDS } from "./fixed-step.ts";
import { deleteJointFromDocument } from "./joint-rules.ts";
import { commandTagOf, describeTags, renamedTags } from "./tags.ts";

// Drives in the simulation step and in the tags (ADR 0022 points 5 to 7).

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

// Two rods on one double-acting valve, and a third rod driven by its setpoint.
const PRESS: PantinDocument = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [{ key: "press", name: "Press" }],
  bodies: ["frame", "rod-l", "rod-r", "rod-3"].map(body),
  joints: [slide("left", "rod-l"), slide("right", "rod-r"), slide("third", "rod-3")],
  drives: [
    {
      id: "valve",
      tagKey: "valve",
      name: "Valve",
      assembly: "press",
      joints: ["left", "right"],
      type: "double_acting_cylinder",
      speed: 0.2,
    },
  ],
  sensors: [],
};

function state(changes: Partial<SimulationState> = {}): SimulationState {
  return {
    jointPositions: new Map(),
    jointVelocities: new Map(),
    queuedSetpoints: new Map(),
    driveCommands: new Map(),
    frozenDriveCommands: new Map(),
    driveStates: new Map(),
    driveFeedback: new Map(),
    jammedJointIds: new Set(),
    ...changes,
  };
}

/** Runs `steps` steps, keeping everything but the positions and velocities fixed. */
function run(initial: SimulationState, steps: number): SimulationState {
  let current = initial;
  for (let step = 0; step < steps; step += 1) {
    current = { ...current, ...stepSimulation(PRESS, current, STEP_SECONDS) };
  }
  return current;
}

const extend = new Map([["valve", { extend: 1 }]]);

describe("stepSimulation with drives", () => {
  it("moves every joint of a drive, and the other joints by their setpoint", () => {
    const setpoint = new Map([["third", 0.03]]);
    const after = run(state({ driveCommands: extend, queuedSetpoints: setpoint }), 61);
    expect([...after.jointPositions]).toEqual([
      ["third", 0.03],
      ["left", 0.1],
      ["right", 0.1],
    ]);
  });

  it("ignores a setpoint queued for a driven joint", () => {
    const after = run(state({ queuedSetpoints: new Map([["left", 0.05]]) }), 1);
    expect(after.jointPositions.get("left") ?? 0).toBe(0);
  });

  it("keeps a jammed joint where it is, whatever drives it", () => {
    const after = run(state({ driveCommands: extend, jammedJointIds: new Set(["left"]) }), 61);
    expect([after.jointPositions.get("left") ?? 0, after.jointPositions.get("right")]).toEqual([
      0, 0.1,
    ]);
  });

  it("runs an unresponsive drive on its frozen commands, ignoring new ones", () => {
    const frozen = new Map([["valve", { extend: 1 }]]);
    const retract = new Map([["valve", { retract: 1 }]]);
    const after = run(state({ driveCommands: retract, frozenDriveCommands: frozen }), 61);
    expect(after.jointPositions.get("left")).toBe(0.1);
  });
});

describe("tags with drives", () => {
  const runtime = {
    jointPositions: new Map([["left", 0.05]]),
    setpoints: new Map(),
    driveCommands: new Map([["valve", { extend: 1 }]]),
    driveFeedback: new Map(),
    sensorOutputs: new Map(),
  };

  it("gives a driven joint its position only, and the drive its command bits", () => {
    expect(
      describeTags(PRESS, runtime).map(({ name, type, value }) => [name, type, value]),
    ).toEqual([
      ["press.left.position", "float", 0.05],
      ["press.right.position", "float", 0],
      ["press.third.setpoint", "float", 0],
      ["press.third.position", "float", 0],
      ["press.valve.extend", "bit", 1],
      ["press.valve.retract", "bit", 0],
    ]);
  });

  it("finds a drive's command, and refuses the setpoint of a driven joint", () => {
    expect(commandTagOf(PRESS, "press.valve.retract")).toMatchObject({
      member: "retract",
      type: "bit",
    });
    expect(() => commandTagOf(PRESS, "press.left.setpoint")).toThrow(
      /No tag "press.left.setpoint"/,
    );
  });

  it("pairs renamed tags by owner and member, drives included", () => {
    const renamed = {
      ...PRESS,
      drives: PRESS.drives.map((drive) => ({ ...drive, tagKey: "distributor" })),
    };
    expect(renamedTags(PRESS, renamed)).toEqual([
      { from: "press.valve.extend", to: "press.distributor.extend" },
      { from: "press.valve.retract", to: "press.distributor.retract" },
    ]);
  });
});

describe("joint deletion and drives", () => {
  it("refuses to delete a driven joint, naming its drive", () => {
    expect(() => deleteJointFromDocument(PRESS, "left")).toThrow(
      'Joint "left" is moved by drive "valve". Remove it from the drive, or delete the drive, first.',
    );
    expect(deleteJointFromDocument(PRESS, "third").joints.map((joint) => joint.id)).toEqual([
      "left",
      "right",
    ]);
  });

  it("points the old setpoint of a driven joint to its drive's commands", () => {
    expect(() => commandTagOf(PRESS, "press.left.setpoint")).toThrow(
      'Joint "left" is moved by drive "valve": write "press.valve.extend", "press.valve.retract" instead.',
    );
  });
});
