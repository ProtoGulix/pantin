import { z } from "zod";
import {
  exceeds,
  finiteNumber,
  NORMALLY_CLOSED_PARAMETER,
  nonNegativeNumber,
  type PlacementRule,
  positiveNumber,
  type SensorParameter,
  SWITCH_TAGS,
  towardsNearerEnd,
} from "../schema-common.ts";

// A mechanical limit switch (plunger or roller lever): its contact changes
// over at the operating position, and changes back only once the joint has
// moved back by the differential travel. Past the operating position the
// actuator can still travel by the overtravel before it is damaged (spike
// 0006, Omron technical guide). It is pressed towards the nearer end of the
// stroke (ADR 0026).
export const LimitSwitchFieldsSchema = z.object({
  type: z.literal("limit_switch"),
  operatingPosition: finiteNumber("operating position"),
  differentialTravel: nonNegativeNumber("differential travel"),
  overtravel: positiveNumber("overtravel"),
  normallyClosed: z.boolean(),
});

type Fields = z.infer<typeof LimitSwitchFieldsSchema>;

// Inside the stroke, nearer one end, and the stroke must not crush it past
// its overtravel.
export const LIMIT_SWITCH_PLACEMENT: PlacementRule<Fields> = {
  problem({ operatingPosition, overtravel }, stroke) {
    if (stroke === null) {
      return "A limit switch needs a joint with end stops.";
    }
    const [lower, upper] = stroke;
    if (exceeds(lower, operatingPosition) || exceeds(operatingPosition, upper)) {
      return "The operating position is outside the stroke: the switch would never be pressed.";
    }
    const pressed = towardsNearerEnd(operatingPosition, stroke);
    if (pressed === null) {
      return "The operating position is at mid-stroke: move it towards the end that presses it.";
    }
    const travelToEnd =
      pressed === "increasing" ? upper - operatingPosition : operatingPosition - lower;
    if (exceeds(travelToEnd, overtravel)) {
      return "The stroke goes past the overtravel: the switch would be destroyed. Move the operating position towards the end, or raise the overtravel.";
    }
    return null;
  },
};

export const LIMIT_SWITCH_PARAMETERS = [
  { field: "operatingPosition", kind: "coordinate" },
  { field: "differentialTravel", kind: "coordinate" },
  { field: "overtravel", kind: "coordinate" },
  NORMALLY_CLOSED_PARAMETER,
] as const satisfies readonly SensorParameter[];

export const LIMIT_SWITCH_TAGS = SWITCH_TAGS;
