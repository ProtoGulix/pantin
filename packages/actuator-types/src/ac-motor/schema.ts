import { z } from "zod";
import {
  type ActuatorInputPort,
  type ActuatorParameter,
  type DefaultFeed,
  positiveRate,
} from "../schema-common.ts";

// AC motor: turns at direction × ratio × nominal speed (ADR 0028 point 8).
// The nominal speed is in the joint's unit per second.
export const AcMotorFieldsSchema = z.object({
  type: z.literal("ac_motor"),
  nominalSpeed: positiveRate("nominal speed"),
});

export const AC_MOTOR_PARAMETERS = [
  { field: "nominalSpeed", kind: "speed" },
] as const satisfies readonly ActuatorParameter[];

export const AC_MOTOR_INPUT_PORTS = [
  { name: "in", domain: "ac_power" },
] as const satisfies readonly ActuatorInputPort[];

export const AC_MOTOR_DEFAULT_FEED = {
  in: ["out"],
} as const satisfies DefaultFeed;
