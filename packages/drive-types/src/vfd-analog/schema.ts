import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// Variable speed drive with an analog setpoint: signed percent of the motor's
// nominal speed, from -100 to 100, through a ramp (ADR 0028 point 6).
export const VfdAnalogFieldsSchema = z.object({
  type: z.literal("vfd_analog"),
  acceleration: positiveRate("acceleration"),
});

export const VFD_ANALOG_PARAMETERS = [
  { field: "acceleration", kind: "percent_per_second" },
] as const satisfies readonly DriveParameter[];

export const VFD_ANALOG_PORTS = [
  { name: "out", domain: "ac_power" },
] as const satisfies readonly DrivePort[];

export const VFD_ANALOG_TAGS = [
  { member: "speed_setpoint", type: "float", direction: "command", quantity: "percent" },
  { member: "speed", type: "float", direction: "feedback", quantity: "percent" },
] as const satisfies readonly DriveTag[];
