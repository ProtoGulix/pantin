import type { z } from "zod";
import type { SwitchZones } from "../switch-zones.ts";
import type { PositionSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof PositionSwitchFieldsSchema>;

// An ideal switch: no hysteresis, on exactly over its range.
export function positionSwitchZones(fields: Fields): SwitchZones {
  return { on: fields.range, hold: fields.range, shown: fields.range };
}
