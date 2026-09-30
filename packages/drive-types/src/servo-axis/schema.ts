import { z } from "zod";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// Servo axis: follows its setpoint within its speed and acceleration limits.
export const ServoAxisFieldsSchema = z.object({
  type: z.literal("servo_axis"),
  maxSpeed: positiveRate("maximum speed"),
  maxAcceleration: positiveRate("maximum acceleration"),
});

export const SERVO_AXIS_PARAMETERS = [
  { field: "maxSpeed", kind: "speed" },
  { field: "maxAcceleration", kind: "acceleration" },
] as const satisfies readonly DriveParameter[];

export const SERVO_AXIS_TAGS = [
  { member: "setpoint", type: "float", direction: "command" },
] as const satisfies readonly DriveTag[];
