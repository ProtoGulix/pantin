import type { z } from "zod";
import { actuationSide, type Stroke } from "../schema-common.ts";
import { beyond, type SwitchZones } from "../switch-zones.ts";
import type { LimitSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof LimitSwitchFieldsSchema>;

// Pushed past the operating position towards the nearer end it is on, however
// far; it lets go once back past it by the differential travel. The
// overtravel is only drawn.
export function limitSwitchZones(fields: Fields, stroke: Stroke): SwitchZones {
  const { operatingPosition: operating, differentialTravel, overtravel } = fields;
  const actuation = actuationSide(operating, stroke);
  const sign = actuation === "increasing" ? 1 : -1;
  const end = operating + sign * overtravel;
  return {
    on: beyond(operating, actuation),
    hold: beyond(operating - sign * differentialTravel, actuation),
    shown: [Math.min(operating, end), Math.max(operating, end)],
  };
}
