import type { Actuator, Drive, Joint, PantinDocument } from "@pantin/protocol";
import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { STEP_SECONDS } from "./fixed-step.ts";
import type { SimulationState } from "./simulation-state.ts";
import { stepSimulation } from "./simulation-step.ts";

// The simulation step (ADR 0028 point 11): drives, then actuators, in id order.

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

function drive(id: string, type: "valve_5_3_closed" | "valve_3_2_single"): Drive {
  return { id, tagKey: id, name: id, assembly: "press", type };
}

const servoDrive: Drive = {
  id: "servo",
  tagKey: "servo",
  name: "Servo",
  assembly: "press",
  type: "servo_drive",
  maxSpeed: 0.5,
  maxAcceleration: 2,
};

function cylinder(id: string, driveId: string | undefined, joints: string[]): Actuator {
  return {
    id,
    name: id,
    assembly: "press",
    type: "double_acting_cylinder",
    extendSpeed: 0.2,
    retractSpeed: 0.2,
    ...(driveId === undefined
      ? {}
      : { feed: { drive: driveId, ports: { cap: "port_4", rod: "port_2" } } }),
    joints,
  };
}

function servoMotor(id: string, joints: string[]): Actuator {
  return {
    id,
    name: id,
    assembly: "press",
    type: "servo_motor",
    feed: { drive: "servo", ports: { in: "out" } },
    joints,
  };
}

// Two cylinders on one valve, a free rod driven by its setpoint, and two rods
// for a servo motor.
function press(changes: Partial<PantinDocument> = {}): PantinDocument {
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Press",
    assemblies: [{ key: "press", name: "Press" }],
    bodies: ["frame", "rod-l", "rod-r", "rod-3", "rod-a", "rod-b"].map(body),
    joints: [
      slide("left", "rod-l"),
      slide("right", "rod-r"),
      slide("third", "rod-3"),
      slide("a", "rod-a"),
      slide("b", "rod-b"),
    ],
    drives: [drive("valve", "valve_5_3_closed"), servoDrive],
    actuators: [cylinder("cyl-l", "valve", ["left"]), cylinder("cyl-r", "valve", ["right"])],
    sensors: [],
    ...changes,
  };
}

function state(changes: Partial<SimulationState> = {}): SimulationState {
  return {
    jointPositions: new Map(),
    jointVelocities: new Map(),
    queuedSetpoints: new Map(),
    driveCommands: new Map(),
    unresponsiveDriveIds: new Set(),
    driveStates: new Map(),
    drivePortStates: new Map(),
    driveFeedback: new Map(),
    driveDiagnostics: new Map(),
    jammedJointIds: new Set(),
    ...changes,
  };
}

/** Runs `steps` steps, keeping the commands, faults and setpoints fixed. */
function run(document: PantinDocument, initial: SimulationState, steps: number): SimulationState {
  let current = initial;
  for (let step = 0; step < steps; step += 1) {
    current = { ...current, ...stepSimulation(document, current, STEP_SECONDS) };
  }
  return current;
}

const extend = new Map([["valve", { coil_14: 1 }]]);
const positionOf = (result: SimulationState, jointId: string) =>
  result.jointPositions.get(jointId) ?? 0;

describe("stepSimulation order", () => {
  it("steps the drives first, so that the actuators move in the same step", () => {
    const after = run(press(), state({ driveCommands: extend }), 1);
    expect(positionOf(after, "left")).toBeCloseTo(0.2 * STEP_SECONDS);
    expect(after.drivePortStates.get("valve")).toEqual({
      port_2: "exhaust",
      port_4: "pressure",
    });
  });

  it("gives the same motion whatever the order of the lists in the document", () => {
    const document = press();
    const reversed = press({
      drives: [...document.drives].reverse(),
      actuators: [...document.actuators].reverse(),
    });
    const first = run(document, state({ driveCommands: extend }), 30);
    const second = run(reversed, state({ driveCommands: extend }), 30);
    expect([...second.jointPositions].sort()).toEqual([...first.jointPositions].sort());
  });
});

describe("stepSimulation with actuators", () => {
  it("moves every joint of an actuator, and the other joints by their setpoint", () => {
    const setpoint = new Map([["third", 0.03]]);
    const after = run(press(), state({ driveCommands: extend, queuedSetpoints: setpoint }), 61);
    expect(Object.fromEntries(after.jointPositions)).toEqual({
      third: 0.03,
      left: 0.1,
      right: 0.1,
    });
  });

  it("ignores a setpoint queued for a moved joint", () => {
    const after = run(press(), state({ queuedSetpoints: new Map([["left", 0.05]]) }), 1);
    expect(positionOf(after, "left")).toBe(0);
  });

  it("keeps a jammed joint where it is, whatever moves it", () => {
    const after = run(
      press(),
      state({ driveCommands: extend, jammedJointIds: new Set(["left"]) }),
      61,
    );
    expect([positionOf(after, "left"), positionOf(after, "right")]).toEqual([0, 0.1]);
    expect(after.jointVelocities.get("left")).toBe(0);
  });
});

describe("stepSimulation without a feed", () => {
  it("holds the joints of an actuator without feed, which no setpoint moves either", () => {
    const document = press({ actuators: [cylinder("cyl-l", undefined, ["left"])] });
    const after = run(
      document,
      state({ driveCommands: extend, queuedSetpoints: new Map([["left", 0.05]]) }),
      30,
    );
    expect(positionOf(after, "left")).toBe(0);
  });

  it("feeds two actuators from one drive port", () => {
    const after = run(press(), state({ driveCommands: extend }), 30);
    expect(positionOf(after, "left")).toBeCloseTo(0.05);
    expect(positionOf(after, "right")).toBeCloseTo(0.05);
  });
});

describe("stepSimulation with port wiring", () => {
  it("swaps the direction when the two tubes are swapped", () => {
    const swapped: Actuator = {
      ...cylinder("cyl-l", "valve", ["left"]),
      feed: { drive: "valve", ports: { cap: "port_2", rod: "port_4" } },
    };
    const start = state({
      driveCommands: extend,
      jointPositions: new Map([["left", 0.1]]),
    });
    const after = run(press({ actuators: [swapped] }), start, 30);
    expect(positionOf(after, "left")).toBeCloseTo(0.05);
  });

  it("raises the conflicting commands diagnostic and keeps the spool, then clears it", () => {
    const both = new Map([["valve", { coil_14: 1, coil_12: 1 }]]);
    const held = run(press(), state({ driveCommands: both }), 1);
    expect(held.driveDiagnostics.get("valve")).toEqual(["conflicting_commands"]);
    const cleared = run(press(), { ...held, driveCommands: extend }, 1);
    expect(cleared.driveDiagnostics.get("valve")).toEqual([]);
  });
});

describe("stepSimulation with a servo drive", () => {
  const servoPress = (joints: string[]) => press({ actuators: [servoMotor("motor", joints)] });
  const target = new Map([["servo", { setpoint: 0.1 }]]);

  it("reports the position of the joint one step late", () => {
    const document = servoPress(["a"]);
    const first = run(document, state({ driveCommands: target }), 1);
    expect(positionOf(first, "a")).toBeGreaterThan(0);
    expect(first.driveFeedback.get("servo")).toEqual({ position: 0 });
    const second = run(document, { ...first, driveCommands: target }, 1);
    expect(second.driveFeedback.get("servo")).toEqual({ position: positionOf(first, "a") });
  });

  it("reports the joint furthest from the setpoint, so that a jammed one shows", () => {
    const document = servoPress(["a", "b"]);
    const start = state({ driveCommands: target, jammedJointIds: new Set(["b"]) });
    const after = run(document, start, 120);
    expect(positionOf(after, "a")).toBe(0.1);
    expect(after.driveFeedback.get("servo")).toEqual({ position: 0 });
  });
});

describe("stepSimulation with an unresponsive drive", () => {
  it("freezes port states and feedback, ignoring new commands", () => {
    const running = run(press(), state({ driveCommands: extend }), 10);
    const retract = new Map([["valve", { coil_12: 1 }]]);
    const frozen = run(
      press(),
      { ...running, driveCommands: retract, unresponsiveDriveIds: new Set(["valve"]) },
      61,
    );
    expect(frozen.drivePortStates.get("valve")).toEqual(running.drivePortStates.get("valve"));
    // The actuators keep reading the frozen port states: the rods go on extending.
    expect(positionOf(frozen, "left")).toBe(0.1);
  });

  it("is not stepped before its first step: nothing to read, the actuators hold", () => {
    const after = run(
      press(),
      state({ driveCommands: extend, unresponsiveDriveIds: new Set(["valve"]) }),
      30,
    );
    expect(after.drivePortStates.has("valve")).toBe(false);
    expect(positionOf(after, "left")).toBe(0);
  });
});
