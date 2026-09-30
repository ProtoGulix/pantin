import { z } from "zod";
import type { SensorParameter, SensorTag } from "../schema-common.ts";

// A position switch (fin de course): on while the joint is within its range,
// the other way round when normally closed.
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
  { field: "normallyClosed", kind: "flag" },
] as const satisfies readonly SensorParameter[];

export const POSITION_SWITCH_TAGS = [
  { member: "state", type: "bit", direction: "feedback" },
] as const satisfies readonly SensorTag[];
