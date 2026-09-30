import type { PneumaticState, PortState } from "@pantin/drive-types/ports";
import { describe, expect, it } from "vitest";
import type { JointMotion } from "./behaviour-common.ts";
import { stepActuator } from "./behaviours.ts";
import type { ActuatorFields } from "./schemas.ts";

// Actuator behaviours stepped at the core's rate (1/120 s, ADR 0005), through
// the registry as the core calls them.

const DT = 1 / 120;

function joint(position: number, lower = 0, upper = 0.1): JointMotion {
  return { position, velocity: 0, lower, upper };
}

/** Runs `steps` steps with fixed port states; answers the joints. */
function run(
  fields: ActuatorFields,
  ports: Record<string, PortState> | null,
  joints: JointMotion[],
  steps: number,
): JointMotion[] {
  let current = joints;
  for (let step = 0; step < steps; step += 1) {
    const output = stepActuator({ fields, ports, joints: current, dt: DT });
    current = current.map((before, index) => ({ ...before, ...output.joints[index] }));
  }
  return current;
}

const positions = (joints: JointMotion[]) => joints.map((entry) => entry.position);

describe("double-acting cylinder", () => {
  const cylinder: ActuatorFields = {
    type: "double_acting_cylinder",
    extendSpeed: 0.25,
    retractSpeed: 0.5,
  };
  const feed = (cap: PneumaticState, rod: PneumaticState) => ({ cap, rod });

  // [cap, rod, start position, expected sign of the velocity]
  it.each<[PneumaticState, PneumaticState, number, number]>([
    ["pressure", "exhaust", 0, 1],
    ["pressure", "pressure", 0, 1],
    ["exhaust", "pressure", 0.1, -1],
  ])("cap %s and rod %s from %s moves with velocity sign %s", (cap, rod, from, sign) => {
    const [moved] = run(cylinder, feed(cap, rod), [joint(from)], 1);
    expect(Math.sign(moved?.velocity ?? 0)).toBe(sign);
    expect(Math.sign((moved?.position ?? from) - from)).toBe(sign);
  });

  it.each<[PneumaticState, PneumaticState]>([
    ["blocked", "blocked"],
    ["exhaust", "exhaust"],
    ["pressure", "blocked"],
    ["blocked", "pressure"],
    ["exhaust", "blocked"],
    ["blocked", "exhaust"],
  ])("cap %s and rod %s: holds, whatever its velocity", (cap, rod) => {
    const moving = { ...joint(0.05), velocity: 0.2 };
    const [held] = run(cylinder, feed(cap, rod), [moving], 10);
    expect(held).toMatchObject({ position: 0.05, velocity: 0 });
  });
});

describe("double-acting cylinder travel", () => {
  const cylinder: ActuatorFields = {
    type: "double_acting_cylinder",
    extendSpeed: 0.25,
    retractSpeed: 0.5,
  };
  const feed = (cap: PneumaticState, rod: PneumaticState) => ({ cap, rod });

  it("extends at its extend speed and stops on the upper limit", () => {
    // 0.1 m at 0.25 m/s takes 0.4 s, 48 steps.
    const [midway] = run(cylinder, feed("pressure", "exhaust"), [joint(0)], 24);
    expect(midway?.position).toBeCloseTo(0.05);
    expect(midway?.velocity).toBe(0.25);
    const [end] = run(cylinder, feed("pressure", "exhaust"), [joint(0)], 49);
    expect(end).toMatchObject({ position: 0.1, velocity: 0 });
  });

  it("retracts at its own speed and stops on the lower limit", () => {
    const [end] = run(cylinder, feed("exhaust", "pressure"), [joint(0.1)], 25);
    expect(end).toMatchObject({ position: 0, velocity: 0 });
    const [midway] = run(cylinder, feed("exhaust", "pressure"), [joint(0.1)], 12);
    expect(midway?.position).toBeCloseTo(0.05);
  });

  it("does not move past a limit it already sits on", () => {
    const [upper] = run(cylinder, feed("pressure", "exhaust"), [joint(0.1)], 5);
    expect(upper?.position).toBe(0.1);
    const [lower] = run(cylinder, feed("exhaust", "pressure"), [joint(0)], 5);
    expect(lower?.position).toBe(0);
  });

  it("moves all its joints together", () => {
    const joints = run(cylinder, feed("pressure", "exhaust"), [joint(0), joint(0.05, 0, 0.2)], 12);
    expect(joints[0]?.position).toBeCloseTo(0.025);
    expect(joints[1]?.position).toBeCloseTo(0.075);
  });

  it("holds without a feed", () => {
    expect(positions(run(cylinder, null, [joint(0.04), joint(0.06)], 10))).toEqual([0.04, 0.06]);
  });

  it("holds when it reads a port of another domain", () => {
    const servo = { setpoint: 1, maxSpeed: 1, maxAcceleration: 1 };
    expect(positions(run(cylinder, { cap: servo, rod: servo }, [joint(0.04)], 10))).toEqual([0.04]);
  });

  it("holds when a port is missing", () => {
    expect(positions(run(cylinder, { cap: "pressure" }, [joint(0.04)], 10))).toEqual([0.04]);
  });
});

describe("single-acting cylinder", () => {
  const cylinder: ActuatorFields = {
    type: "single_acting_cylinder",
    extendSpeed: 0.25,
    returnSpeed: 0.1,
  };

  it("extends under pressure, at its extend speed", () => {
    const [moved] = run(cylinder, { cap: "pressure" }, [joint(0)], 12);
    expect(moved?.position).toBeCloseTo(0.025);
    expect(positions(run(cylinder, { cap: "pressure" }, [joint(0)], 49))).toEqual([0.1]);
  });

  it("returns on its spring when the cap is exhausted, at its return speed", () => {
    const [moved] = run(cylinder, { cap: "exhaust" }, [joint(0.1)], 12);
    expect(moved?.position).toBeCloseTo(0.09);
    expect(positions(run(cylinder, { cap: "exhaust" }, [joint(0.1)], 121))).toEqual([0]);
  });

  it("holds when it reads a port of another domain", () => {
    const servo = { setpoint: 1, maxSpeed: 1, maxAcceleration: 1 };
    expect(positions(run(cylinder, { cap: servo }, [joint(0.04)], 10))).toEqual([0.04]);
  });

  it("holds when the cap is blocked, and without a feed", () => {
    expect(positions(run(cylinder, { cap: "blocked" }, [joint(0.04)], 10))).toEqual([0.04]);
    expect(positions(run(cylinder, null, [joint(0.04)], 10))).toEqual([0.04]);
  });
});

describe("ac motor", () => {
  const motor: ActuatorFields = { type: "ac_motor", nominalSpeed: 3 };
  const spin = (position: number) => joint(position, -Infinity, Infinity);

  it("turns at direction × ratio × nominal speed, at once", () => {
    const [forward] = run(motor, { in: { direction: 1, ratio: 1 } }, [spin(0)], 1);
    expect(forward).toMatchObject({ velocity: 3 });
    expect(forward?.position).toBeCloseTo(3 * DT);
    const [half] = run(motor, { in: { direction: -1, ratio: 0.5 } }, [spin(0)], 1);
    expect(half?.velocity).toBe(-1.5);
  });

  it("stops when the direction is 0 or the ratio is 0", () => {
    const moving = { ...spin(1), velocity: 3 };
    expect(run(motor, { in: { direction: 0, ratio: 1 } }, [moving], 1)[0]).toMatchObject({
      position: 1,
      velocity: 0,
    });
    expect(run(motor, { in: { direction: 1, ratio: 0 } }, [moving], 1)[0]?.velocity).toBe(0);
  });

  it("is stopped by the limits of its joint", () => {
    const [stopped] = run(motor, { in: { direction: 1, ratio: 1 } }, [joint(0.099, 0, 0.1)], 5);
    expect(stopped).toMatchObject({ position: 0.1, velocity: 0 });
  });

  it("holds without a feed", () => {
    expect(run(motor, null, [{ ...spin(2), velocity: 3 }], 3)[0]).toMatchObject({
      position: 2,
      velocity: 0,
    });
  });

  it("holds when it reads a port of another domain", () => {
    const servo = { setpoint: 1, maxSpeed: 1, maxAcceleration: 1 };
    expect(positions(run(motor, { in: servo }, [spin(2)], 3))).toEqual([2]);
  });
});
