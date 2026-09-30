import type { ServoState } from "@pantin/drive-types/ports";
import type { z } from "zod";
import {
  clamp,
  holdPosition,
  type JointMotion,
  rampToward,
  servoPort,
} from "../behaviour-common.ts";
import type { ActuatorBehaviour } from "../behaviour-step-common.ts";
import type { ServoMotorFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ServoMotorFieldsSchema>;

// brakingSpeed and followSetpoint come from the servo axis of ADR 0022, which
// ADR 0028 split into a servo drive and this motor.

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
function followSetpoint(joint: JointMotion, servo: ServoState, dt: number) {
  const target = clamp(servo.setpoint, joint.lower, joint.upper);
  const distance = target - joint.position;
  const maxChange = servo.maxAcceleration * dt;
  const speedLimit = Math.min(servo.maxSpeed, brakingSpeed(distance, servo.maxAcceleration, dt));
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

export const servoMotor: ActuatorBehaviour<Fields> = {
  step: ({ ports, joints, dt }) => {
    const servo = servoPort(ports, "in");
    return {
      joints: joints.map((joint) =>
        servo === undefined ? holdPosition(joint) : followSetpoint(joint, servo, dt),
      ),
    };
  },
};
