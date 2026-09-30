import type { z } from "zod";
import { beyond, type SwitchZones } from "../switch-zones.ts";
import type { LimitSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof LimitSwitchFieldsSchema>;

// Pushed past the operating position it is on, however far; it lets go once
// back past it by the differential travel. The overtravel is only drawn.
export function limitSwitchZones(fields: Fields): SwitchZones {
  const { operatingPosition: operating, actuation, differentialTravel, overtravel } = fields;
  const sign = actuation === "increasing" ? 1 : -1;
  const end = operating + sign * overtravel;
  return {
    on: beyond(operating, actuation),
    hold: beyond(operating - sign * differentialTravel, actuation),
    shown: [Math.min(operating, end), Math.max(operating, end)],
  };
}
