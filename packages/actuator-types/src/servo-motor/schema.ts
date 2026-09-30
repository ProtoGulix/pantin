import { z } from "zod";
import type { ActuatorInputPort, ActuatorParameter, DefaultFeed } from "../schema-common.ts";

// Servo motor: follows the setpoint its drive hands over, within the drive's
// speed and acceleration limits (ADR 0028 point 8). It has no parameters.
export const ServoMotorFieldsSchema = z.object({
  type: z.literal("servo_motor"),
});

export const SERVO_MOTOR_PARAMETERS = [] as const satisfies readonly ActuatorParameter[];

export const SERVO_MOTOR_INPUT_PORTS = [
  { name: "in", domain: "servo" },
] as const satisfies readonly ActuatorInputPort[];

export const SERVO_MOTOR_DEFAULT_FEED = {
  in: ["out"],
} as const satisfies DefaultFeed;
