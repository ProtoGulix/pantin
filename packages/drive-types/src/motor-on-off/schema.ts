import { z } from "zod";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// Motor switched on and off: "run" at the nominal speed, "reverse" the
// other way, both through a ramp.
export const MotorOnOffFieldsSchema = z.object({
  type: z.literal("motor_on_off"),
  nominalSpeed: positiveRate("nominal speed"),
  acceleration: positiveRate("acceleration"),
});

export const MOTOR_ON_OFF_PARAMETERS = [
  { field: "nominalSpeed", kind: "speed" },
  { field: "acceleration", kind: "acceleration" },
] as const satisfies readonly DriveParameter[];

export const MOTOR_ON_OFF_TAGS = [
  { member: "run", type: "bit", direction: "command" },
  { member: "reverse", type: "bit", direction: "command" },
  { member: "speed", type: "float", direction: "feedback" },
] as const satisfies readonly DriveTag[];
