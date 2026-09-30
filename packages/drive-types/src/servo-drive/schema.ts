import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// Servo drive: hands its setpoint and its limits to the servo motor it feeds.
// Setpoint, feedback and limits are in the unit of the joints moved in the end.
export const ServoDriveFieldsSchema = z.object({
  type: z.literal("servo_drive"),
  maxSpeed: positiveRate("maximum speed"),
  maxAcceleration: positiveRate("maximum acceleration"),
});

export const SERVO_DRIVE_PARAMETERS = [
  { field: "maxSpeed", kind: "speed" },
  { field: "maxAcceleration", kind: "acceleration" },
] as const satisfies readonly DriveParameter[];

export const SERVO_DRIVE_PORTS = [
  { name: "out", domain: "servo" },
] as const satisfies readonly DrivePort[];

export const SERVO_DRIVE_TAGS = [
  { member: "setpoint", type: "float", direction: "command", quantity: "position" },
  { member: "position", type: "float", direction: "feedback", quantity: "position" },
] as const satisfies readonly DriveTag[];
