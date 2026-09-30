import { z } from "zod";
import {
  type ActuatorInputPort,
  type ActuatorParameter,
  type DefaultFeed,
  positiveRate,
} from "../schema-common.ts";

// Single-acting cylinder: pressure on `cap` extends it, a spring returns it
// when `cap` is exhausted (ADR 0028 point 8).
export const SingleActingCylinderFieldsSchema = z.object({
  type: z.literal("single_acting_cylinder"),
  extendSpeed: positiveRate("extend speed"),
  returnSpeed: positiveRate("return speed"),
});

export const SINGLE_ACTING_CYLINDER_PARAMETERS = [
  { field: "extendSpeed", kind: "speed" },
  { field: "returnSpeed", kind: "speed" },
] as const satisfies readonly ActuatorParameter[];

export const SINGLE_ACTING_CYLINDER_INPUT_PORTS = [
  { name: "cap", domain: "pneumatic" },
] as const satisfies readonly ActuatorInputPort[];

// `port_4` of a 5/x valve, else `port_2` of a 3/2 (ADR 0028 point 2).
export const SINGLE_ACTING_CYLINDER_DEFAULT_FEED = {
  cap: ["port_4", "port_2"],
} as const satisfies DefaultFeed;
