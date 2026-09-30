import { z } from "zod";
import { NORMALLY_CLOSED_PARAMETER, type SensorParameter, SWITCH_TAGS } from "../schema-common.ts";

// An ideal switch: on while the joint is within its range, without hysteresis,
// the other way round when normally closed. The realistic types sit next to it
// (ADR 0025).
export const PositionSwitchFieldsSchema = z.object({
  type: z.literal("position_switch"),
  // [lower, upper] of the joint's coordinate, where the switch is actuated.
  range: z
    .tuple([z.number(), z.number()])
    .refine((range) => range.every(Number.isFinite), "The range must be finite numbers.")
    .refine(([lower, upper]) => lower <= upper, "The lower bound must not exceed the upper one."),
  normallyClosed: z.boolean(),
});

export const POSITION_SWITCH_PARAMETERS = [
  { field: "range", kind: "coordinateRange" },
  NORMALLY_CLOSED_PARAMETER,
] as const satisfies readonly SensorParameter[];

export const POSITION_SWITCH_TAGS = SWITCH_TAGS;
