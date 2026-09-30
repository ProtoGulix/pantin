import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// Variable speed drive switched on and off: "run" ramps to the nominal speed,
// "reverse" the other way. It knows no motor: the ramp is in percent of the
// motor's nominal speed per second (ADR 0028 point 6).
export const VfdOnOffFieldsSchema = z.object({
  type: z.literal("vfd_on_off"),
  acceleration: positiveRate("acceleration"),
});

export const VFD_ON_OFF_PARAMETERS = [
  { field: "acceleration", kind: "percent_per_second" },
] as const satisfies readonly DriveParameter[];

export const VFD_ON_OFF_PORTS = [
  { name: "out", domain: "ac_power" },
] as const satisfies readonly DrivePort[];

export const VFD_ON_OFF_TAGS = [
  { member: "run", type: "bit", direction: "command" },
  { member: "reverse", type: "bit", direction: "command" },
  { member: "speed", type: "float", direction: "feedback", quantity: "percent" },
] as const satisfies readonly DriveTag[];
