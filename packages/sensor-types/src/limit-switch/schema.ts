import { z } from "zod";
import {
  DIRECTIONS,
  DirectionSchema,
  finiteNumber,
  NORMALLY_CLOSED_PARAMETER,
  nonNegativeNumber,
  positiveNumber,
  type SensorParameter,
  SWITCH_TAGS,
} from "../schema-common.ts";

// A mechanical limit switch (plunger or roller lever): its contact changes
// over at the operating position, and changes back only once the joint has
// moved back by the differential travel. Past the operating position the
// actuator can still travel by the overtravel before it is damaged (spike
// 0006, Omron technical guide).
export const LimitSwitchFieldsSchema = z.object({
  type: z.literal("limit_switch"),
  operatingPosition: finiteNumber("operating position"),
  // The way the joint moves to press it.
  actuation: DirectionSchema,
  differentialTravel: nonNegativeNumber("differential travel"),
  overtravel: positiveNumber("overtravel"),
  normallyClosed: z.boolean(),
});

export const LIMIT_SWITCH_PARAMETERS = [
  { field: "operatingPosition", kind: "coordinate" },
  { field: "actuation", kind: "choice", options: DIRECTIONS },
  { field: "differentialTravel", kind: "coordinate" },
  { field: "overtravel", kind: "coordinate" },
  NORMALLY_CLOSED_PARAMETER,
] as const satisfies readonly SensorParameter[];

export const LIMIT_SWITCH_TAGS = SWITCH_TAGS;
