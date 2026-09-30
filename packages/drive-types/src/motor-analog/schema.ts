import { z } from "zod";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// Motor driven by an analog speed setpoint, reached through a ramp.
export const MotorAnalogFieldsSchema = z.object({
  type: z.literal("motor_analog"),
  acceleration: positiveRate("acceleration"),
});

export const MOTOR_ANALOG_PARAMETERS = [
  { field: "acceleration", kind: "acceleration" },
] as const satisfies readonly DriveParameter[];

export const MOTOR_ANALOG_TAGS = [
  { member: "speed_setpoint", type: "float", direction: "command", quantity: "speed" },
  { member: "speed", type: "float", direction: "feedback", quantity: "speed" },
] as const satisfies readonly DriveTag[];
