import type { z } from "zod";
import { clamp, type DriveBehaviour, type JointMotion, rampToward } from "../behaviour-common.ts";
import type { ServoAxisFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ServoAxisFieldsSchema>;

// The highest speed from which braking by acceleration * dt at each step
// still stops within `distance`: the discrete counterpart of sqrt(2 a d),
// which would arrive too fast at 1/120 s steps.
function brakingSpeed(distance: number, acceleration: number, dt: number): number {
  const half = (acceleration * dt) / 2;
  return -half + Math.sqrt(half * half + 2 * acceleration * Math.abs(distance));
}

// A trapezoidal profile toward the setpoint: accelerate, cruise at the
// maximum speed, brake so as to stop on the target. The velocity never
// changes by more than acceleration * dt in a step, the stop included: a
// setpoint moved inside the braking distance is overshot, then reached
// coming back, as a real axis would.
function followSetpoint(joint: JointMotion, setpoint: number, fields: Fields, dt: number) {
  const target = clamp(setpoint, joint.lower, joint.upper);
  const distance = target - joint.position;
  const maxChange = fields.maxAcceleration * dt;
  const speedLimit = Math.min(fields.maxSpeed, brakingSpeed(distance, fields.maxAcceleration, dt));
  const velocity = rampToward(joint.velocity, Math.sign(distance) * speedLimit, maxChange);
  // Never past a limit, even for one step while settling on it.
  const position = clamp(joint.position + velocity * dt, joint.lower, joint.upper);
  const reached = Math.sign(target - position) !== Math.sign(distance) || position === target;
  // Stopping from the previous step's velocity must stay within one change.
  if (reached && Math.abs(joint.velocity) <= maxChange) {
    return { position: target, velocity: 0 };
  }
  return { position, velocity };
}

export const servoAxis: DriveBehaviour<Fields> = {
  step: ({ fields, commands, joints, dt }) => {
    const setpoint = commands.setpoint ?? 0;
    return {
      joints: joints.map((joint) => followSetpoint(joint, setpoint, fields, dt)),
      state: {},
      feedback: {},
    };
  },
};
