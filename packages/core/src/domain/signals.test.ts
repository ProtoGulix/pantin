import { bodyEndpoint, type PantinDocument, SignalSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { emitter, photoelectricCell } from "../test-support/conveyor-fixtures.ts";
import { documentOf, joint } from "../test-support/placed-fixtures.ts";
import { deriveSignals, unitOfQuantity } from "./signals.ts";

describe("unitOfQuantity", () => {
  it.each([
    ["speed", "metre", "metre_per_second"],
    ["speed", "radian", "radian_per_second"],
    ["speed", "unknown", "unknown"],
    ["position", "metre", "metre"],
    ["position", "unknown", "unknown"],
    ["percent", "metre", "percent"],
    [undefined, "metre", "none"],
  ] as const)("gives %s on %s joints the unit %s", (quantity, drivenUnit, expected) => {
    expect(unitOfQuantity(quantity, drivenUnit)).toBe(expected);
  });
});

// Units, owners and descriptions of the signals (ADR 0064 point 2).

function servo(id: string, name: string) {
  return {
    id,
    tagKey: id,
    name,
    assembly: "main",
    type: "servo_drive" as const,
    maxSpeed: 1,
    maxAcceleration: 2,
  };
}

function servoMotor(id: string, drive: string, joints: string[]) {
  return {
    id,
    name: id,
    assembly: "main",
    type: "servo_motor" as const,
    feed: { drive, ports: { in: "out" } },
    joints,
  };
}

const MACHINE: PantinDocument = documentOf(
  [
    joint({
      id: "slide",
      type: "prismatic",
      parent: bodyEndpoint("frame"),
      child: bodyEndpoint("carriage"),
      limits: [0, 0.1],
    }),
    joint({
      id: "arm",
      type: "revolute",
      parent: bodyEndpoint("frame"),
      child: bodyEndpoint("clevis"),
    }),
    joint({
      id: "free",
      type: "revolute",
      parent: bodyEndpoint("frame"),
      child: bodyEndpoint("pin"),
    }),
  ],
  undefined,
  undefined,
  {
    drives: [
      servo("axis", "Axis servo"),
      servo("rotor", "Rotor servo"),
      servo("idle", "Idle servo"),
      {
        id: "fan",
        tagKey: "fan",
        name: "Fan",
        assembly: "main",
        type: "vfd_analog",
        acceleration: 50,
      },
      { id: "relay", tagKey: "relay", name: "Relay", assembly: "main", type: "contactor" },
      { id: "valve", tagKey: "valve", name: "Vérin 1", assembly: "main", type: "valve_5_3_closed" },
    ],
    actuators: [servoMotor("slider", "axis", ["slide"]), servoMotor("turner", "rotor", ["arm"])],
    sensors: [
      {
        id: "limit",
        tagKey: "limit",
        name: "Limit",
        assembly: "main",
        joint: "slide",
        type: "position_switch",
        range: [0.09, 0.1],
        normallyClosed: false,
      },
      {
        id: "counter",
        tagKey: "counter",
        name: "Counter",
        assembly: "main",
        joint: "slide",
        type: "encoder",
        pulsesPerUnit: 1000,
      },
    ],
    emitters: [emitter()],
    presenceSensors: [photoelectricCell()],
  },
);

function signalNamed(name: string) {
  const signal = deriveSignals(MACHINE).find((candidate) => candidate.name === name);
  if (signal === undefined) {
    throw new Error(`No signal ${name}`);
  }
  return signal;
}

describe("deriveSignals", () => {
  it("gives only valid signals, one per tag", () => {
    const signals = deriveSignals(MACHINE);
    for (const signal of signals) {
      expect(SignalSchema.safeParse(signal).success).toBe(true);
    }
    expect(new Set(signals.map((signal) => signal.name)).size).toBe(signals.length);
  });

  it("gives joint tags the unit of the joint coordinate", () => {
    expect(signalNamed("main.slide.position").unit).toBe("metre");
    expect(signalNamed("chape.arm.position").unit).toBe("radian");
    expect(signalNamed("tail.free.setpoint").unit).toBe("radian");
  });

  it("gives a servo drive the unit of the joints its actuators move", () => {
    expect(signalNamed("main.axis.setpoint").unit).toBe("metre");
    expect(signalNamed("main.axis.position").unit).toBe("metre");
    expect(signalNamed("main.rotor.setpoint").unit).toBe("radian");
  });

  it("says unknown for a servo drive that feeds no actuator", () => {
    expect(signalNamed("main.idle.setpoint").unit).toBe("unknown");
    expect(signalNamed("main.idle.position").unit).toBe("unknown");
  });

  it("gives a variable speed drive percent", () => {
    expect(signalNamed("main.fan.speed_setpoint").unit).toBe("percent");
    expect(signalNamed("main.fan.speed").unit).toBe("percent");
  });

  it("gives bits and counts of drives and sensors no unit", () => {
    for (const name of [
      "main.relay.run",
      "main.valve.coil_14",
      "main.limit.state",
      "main.counter.count",
      "main.source.spawn",
      "main.cell.state",
    ]) {
      expect(signalNamed(name).unit).toBe("none");
    }
  });

  it("names the owner and builds an English description from its name and the member label", () => {
    expect(signalNamed("main.valve.coil_14")).toMatchObject({
      owner: { kind: "drive", id: "valve", name: "Vérin 1" },
      member: "coil_14",
    });
    expect(signalNamed("main.valve.coil_14").description).toMatch(/^Drive "Vérin 1": .+/);
    expect(signalNamed("main.cell.state")).toMatchObject({
      owner: { kind: "presence_sensor", id: "cell", name: "Cell" },
      description: 'Presence sensor "Cell": State',
    });
    expect(signalNamed("tail.free.setpoint").description).toBe('Joint "free": Setpoint');
  });

  it("follows the order of the tags: joints, drives, sensors, emitters, presence sensors", () => {
    const kinds = deriveSignals(MACHINE).map((signal) => signal.owner.kind);
    expect(kinds[0]).toBe("joint");
    expect(kinds.at(-1)).toBe("presence_sensor");
    expect(kinds.indexOf("drive")).toBeLessThan(kinds.indexOf("sensor"));
    expect(kinds.indexOf("sensor")).toBeLessThan(kinds.indexOf("emitter"));
  });
});
