import { z } from "zod";
import {
  type ActuatorInputPort,
  type ActuatorParameter,
  type DefaultFeed,
  positiveRate,
} from "../schema-common.ts";

// Double-acting cylinder: pressure on `cap` extends it, pressure on `rod`
// retracts it (ADR 0028 point 8).
export const DoubleActingCylinderFieldsSchema = z.object({
  type: z.literal("double_acting_cylinder"),
  extendSpeed: positiveRate("extend speed"),
  retractSpeed: positiveRate("retract speed"),
});

export const DOUBLE_ACTING_CYLINDER_PARAMETERS = [
  { field: "extendSpeed", kind: "speed" },
  { field: "retractSpeed", kind: "speed" },
] as const satisfies readonly ActuatorParameter[];

export const DOUBLE_ACTING_CYLINDER_INPUT_PORTS = [
  { name: "cap", domain: "pneumatic" },
  { name: "rod", domain: "pneumatic" },
] as const satisfies readonly ActuatorInputPort[];

export const DOUBLE_ACTING_CYLINDER_DEFAULT_FEED = {
  cap: ["port_4"],
  rod: ["port_2"],
} as const satisfies DefaultFeed;
