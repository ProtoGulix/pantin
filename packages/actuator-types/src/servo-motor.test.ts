import type { ServoState } from "@pantin/drive-types/ports";
import { describe, expect, it } from "vitest";
import type { JointMotion } from "./behaviour-common.ts";
import { stepActuator } from "./behaviours.ts";

// The servo motor follows its port's setpoint with a trapezoidal profile
// (ADR 0028 point 8); the tests are those of the servo axis of ADR 0022.

const DT = 1 / 120;
const servoMotor = { type: "servo_motor" } as const;
const limits = { maxSpeed: 0.5, maxAcceleration: 2 };
const maxChange = 2 * DT + 1e-12;

function joint(position: number, lower = 0, upper = 0.1): JointMotion {
  return { position, velocity: 0, lower, upper };
}

// Steps until the motor rests, checking both bounds at every step, the stop
// included; `setpointAt` may change the setpoint along the way.
function travel(start: JointMotion, setpointAt: (step: number) => number) {
  let current = start;
  for (let step = 0; step < 2000; step += 1) {
    const port: ServoState = { setpoint: setpointAt(step), ...limits };
    const output = stepActuator({
      fields: servoMotor,
      ports: { in: port },
      joints: [current],
      dt: DT,
    });
    const next = { ...current, ...output.joints[0] };
    expect(Math.abs(next.velocity)).toBeLessThanOrEqual(0.5 + 1e-12);
    expect(Math.abs(next.velocity - current.velocity)).toBeLessThanOrEqual(maxChange);
    expect(next.position).toBeGreaterThanOrEqual(next.lower);
    expect(next.position).toBeLessThanOrEqual(next.upper);
    current = next;
    if (step > 0 && current.velocity === 0) {
      return { joint: current, steps: step + 1 };
    }
  }
  throw new Error("The motor never came to rest.");
}

describe("servo motor", () => {
  it("cruises, brakes and stops exactly on its setpoint, within both bounds", () => {
    const { joint: end, steps } = travel(joint(0, -1, 1), () => 0.6);
    expect(end.position).toBe(0.6);
    // 0.6 m: 0.25 s to reach 0.5 m/s, cruise, 0.25 s to brake: about 1.45 s.
    expect(steps).toBeGreaterThan(170);
    expect(steps).toBeLessThan(185);
  });

  it("goes the other way for a setpoint behind it", () => {
    expect(travel(joint(0.3, -1, 1), () => -0.2).joint.position).toBe(-0.2);
  });

  it("overshoots a setpoint moved inside its braking distance, then comes back", () => {
    // At full speed toward 0.9, the setpoint jumps to just ahead of the motor.
    const moving = { ...joint(0, -1, 1), velocity: 0.5 };
    const { joint: end } = travel(moving, (step) => (step < 1 ? 0.9 : 0.01));
    expect(end.position).toBe(0.01);
  });

  it("stays within its limits whatever the setpoint", () => {
    expect(travel(joint(0), () => 3).joint.position).toBe(0.1);
  });

  it.each([
    [0, 0.0001, 0],
    [0.5, -0.73, 0.4],
    [-0.2, 0.9, -0.5],
    [0.1, 0.1000001, 0.5],
  ])(
    "rests exactly on its setpoint from %s to %s at %s m/s, within both bounds",
    (from, to, speed) => {
      const start = { ...joint(from, -1, 1), velocity: speed };
      expect(travel(start, () => to).joint.position).toBe(to);
    },
  );
});

describe("servo motor ports and joints", () => {
  it("follows the limits its port hands over, not fixed ones", () => {
    const port: ServoState = { setpoint: 1, maxSpeed: 0.1, maxAcceleration: 1 };
    let current = joint(0, -1, 1);
    for (let step = 0; step < 60; step += 1) {
      const output = stepActuator({
        fields: servoMotor,
        ports: { in: port },
        joints: [current],
        dt: DT,
      });
      current = { ...current, ...output.joints[0] };
    }
    expect(current.velocity).toBeCloseTo(0.1);
  });

  it("moves several joints, each to the setpoint within its own limits", () => {
    const port: ServoState = { setpoint: 0.3, ...limits };
    let joints = [joint(0, -1, 1), joint(0.2, 0, 0.25)];
    for (let step = 0; step < 400; step += 1) {
      const output = stepActuator({ fields: servoMotor, ports: { in: port }, joints, dt: DT });
      joints = joints.map((before, index) => ({ ...before, ...output.joints[index] }));
    }
    expect(joints.map((entry) => entry.position)).toEqual([0.3, 0.25]);
  });

  it("holds when it reads a port of another domain", () => {
    const moving = { ...joint(0.05), velocity: 0.3 };
    const output = stepActuator({
      fields: servoMotor,
      ports: { in: { direction: 1, ratio: 1 } },
      joints: [moving],
      dt: DT,
    });
    expect(output.joints).toEqual([{ position: 0.05, velocity: 0 }]);
  });

  it("holds without a feed", () => {
    const moving = { ...joint(0.05), velocity: 0.3 };
    const output = stepActuator({ fields: servoMotor, ports: null, joints: [moving], dt: DT });
    expect(output.joints).toEqual([{ position: 0.05, velocity: 0 }]);
  });
});
