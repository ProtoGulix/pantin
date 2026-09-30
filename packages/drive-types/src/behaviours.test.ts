import { describe, expect, it } from "vitest";
import type { JointMotion } from "./behaviour-common.ts";
import { stepDrive } from "./behaviours.ts";
import type { DriveFields } from "./schemas.ts";

// Drive behaviours stepped at the core's rate (1/120 s, ADR 0005), through
// the registry as the core calls them.

const DT = 1 / 120;

function joint(position: number, lower = 0, upper = 0.1): JointMotion {
  return { position, velocity: 0, lower, upper };
}

/** Runs `steps` steps with fixed commands; answers the joints and the feedback. */
function run(
  fields: DriveFields,
  commands: Record<string, number>,
  joints: JointMotion[],
  steps: number,
) {
  let current = joints;
  let state: Record<string, number> = {};
  let feedback: Record<string, number> = {};
  for (let step = 0; step < steps; step += 1) {
    const output = stepDrive({ fields, commands, state, joints: current, dt: DT });
    current = output.joints.map((next, index) => ({ ...(current[index] ?? joint(0)), ...next }));
    state = output.state;
    feedback = output.feedback;
  }
  return { joints: current, feedback };
}

const positions = (result: { joints: JointMotion[] }) => result.joints.map((item) => item.position);

describe("double-acting cylinder (phase 4 exit criterion)", () => {
  const cylinder: DriveFields = { type: "double_acting_cylinder", speed: 0.2 };

  it("extends with extend, retracts with retract, at its speed", () => {
    // 0.1 m at 0.2 m/s: half a second, 60 steps.
    expect(positions(run(cylinder, { extend: 1 }, [joint(0)], 30))[0]).toBeCloseTo(0.05);
    expect(positions(run(cylinder, { extend: 1 }, [joint(0)], 61))).toEqual([0.1]);
    expect(positions(run(cylinder, { retract: 1 }, [joint(0.1)], 61))).toEqual([0]);
  });

  it("holds its position with no coil or both coils, having no spring", () => {
    expect(positions(run(cylinder, {}, [joint(0.04)], 60))).toEqual([0.04]);
    expect(positions(run(cylinder, { extend: 1, retract: 1 }, [joint(0.04)], 60))).toEqual([0.04]);
  });

  it("stops in mid-stroke when its coil falls, and holds there", () => {
    const halfway = run(cylinder, { extend: 1 }, [joint(0)], 30).joints;
    expect(positions(run(cylinder, {}, halfway, 30))).toEqual(positions({ joints: halfway }));
  });

  it("moves two cylinders on one valve, each between its own limits", () => {
    const result = run(cylinder, { extend: 1 }, [joint(0), joint(0, 0, 0.3)], 200);
    expect(positions(result)).toEqual([0.1, 0.3]);
  });
});

describe("single-acting cylinder (phase 4 exit criterion)", () => {
  const cylinder: DriveFields = { type: "single_acting_cylinder", speed: 0.2 };

  it("turns back on its spring when the coil falls in mid-stroke", () => {
    const halfway = run(cylinder, { extend: 1 }, [joint(0)], 30).joints;
    expect(positions(run(cylinder, { extend: 0 }, halfway, 10))[0]).toBeLessThan(
      halfway[0]?.position ?? 0,
    );
  });

  it("extends with its coil and retracts on its spring as soon as the coil falls", () => {
    expect(positions(run(cylinder, { extend: 1 }, [joint(0)], 61))).toEqual([0.1]);
    expect(positions(run(cylinder, { extend: 0 }, [joint(0.1)], 61))).toEqual([0]);
  });
});

describe("servo axis", () => {
  const axis: DriveFields = { type: "servo_axis", maxSpeed: 0.5, maxAcceleration: 2 };
  const maxChange = 2 * DT + 1e-12;

  // Steps until the axis rests, checking both bounds at every step, the stop
  // included; `setpointAt` may change the setpoint along the way.
  function travel(start: JointMotion, setpointAt: (step: number) => number) {
    let current = start;
    for (let step = 0; step < 2000; step += 1) {
      const commands = { setpoint: setpointAt(step) };
      const output = stepDrive({ fields: axis, commands, state: {}, joints: [current], dt: DT });
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
    throw new Error("The axis never came to rest.");
  }

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
    // At full speed toward 0.9, the setpoint jumps to just ahead of the axis.
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

describe("motors", () => {
  const spin = (position: number) => joint(position, -Infinity, Infinity);

  it("ramps an analog motor to its speed setpoint and reports it", () => {
    const motor: DriveFields = { type: "motor_analog", acceleration: 10 };
    // 10 rad/s² reaches 5 rad/s in half a second.
    expect(run(motor, { speed_setpoint: 5 }, [spin(0)], 30).feedback.speed).toBeCloseTo(2.5);
    expect(run(motor, { speed_setpoint: 5 }, [spin(0)], 120).feedback.speed).toBe(5);
  });

  it("runs an on/off motor at its nominal speed, reversed on demand, and stops it", () => {
    const motor: DriveFields = { type: "motor_on_off", nominalSpeed: 3, acceleration: 30 };
    expect(run(motor, { run: 1 }, [spin(0)], 60).feedback.speed).toBe(3);
    expect(run(motor, { run: 1, reverse: 1 }, [spin(0)], 60).feedback.speed).toBe(-3);
    expect(run(motor, { reverse: 1 }, [spin(0)], 60).feedback.speed).toBe(0);
  });

  it("stops a joint at its limit, as against an end stop", () => {
    const motor: DriveFields = { type: "motor_on_off", nominalSpeed: 1, acceleration: 100 };
    const result = run(motor, { run: 1 }, [joint(0)], 60);
    expect(result.joints[0]).toMatchObject({ position: 0.1, velocity: 0 });
  });
});
