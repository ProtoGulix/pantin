import type { z } from "zod";
import { beyond, type SwitchZones } from "../switch-zones.ts";
import { type InductiveSwitchFieldsSchema, MATERIAL_FACTORS } from "./schema.ts";

type Fields = z.infer<typeof InductiveSwitchFieldsSchema>;

// On from the effective distance before the face onwards, the target past the
// face included (it would have hit the sensor); off beyond the distance
// widened by the hysteresis. The drawn zone is the gap it detects.
export function inductiveSwitchZones(fields: Fields): SwitchZones {
  const reach = fields.nominalDistance * MATERIAL_FACTORS[fields.material];
  const release = reach * (1 + fields.hysteresisPercent / 100);
  const sign = fields.approach === "increasing" ? 1 : -1;
  const switchOn = fields.facePosition - sign * reach;
  return {
    on: beyond(switchOn, fields.approach),
    hold: beyond(fields.facePosition - sign * release, fields.approach),
    shown: [Math.min(switchOn, fields.facePosition), Math.max(switchOn, fields.facePosition)],
  };
}
