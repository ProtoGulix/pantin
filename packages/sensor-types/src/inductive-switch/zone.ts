import type { z } from "zod";
import { actuationSide, type Stroke } from "../schema-common.ts";
import { beyond, type SwitchZones } from "../switch-zones.ts";
import { type InductiveSwitchFieldsSchema, MATERIAL_FACTORS } from "./schema.ts";

type Fields = z.infer<typeof InductiveSwitchFieldsSchema>;

/** The effective sensing distance, and the gap at which the sensor lets go. */
export function inductiveDistances(fields: Fields) {
  const reach = fields.nominalDistance * MATERIAL_FACTORS[fields.material];
  return { reach, release: reach * (1 + fields.hysteresisPercent / 100) };
}

// The target comes from the stroke towards the face. On from the effective
// distance before the face onwards, the target past the face included (a
// placement the document refuses, ADR 0026); off beyond the distance widened
// by the hysteresis. The drawn zone is the gap it detects.
export function inductiveSwitchZones(fields: Fields, stroke: Stroke): SwitchZones {
  const { reach, release } = inductiveDistances(fields);
  const approach = actuationSide(fields.facePosition, stroke);
  const sign = approach === "increasing" ? 1 : -1;
  const switchOn = fields.facePosition - sign * reach;
  return {
    on: beyond(switchOn, approach),
    hold: beyond(fields.facePosition - sign * release, approach),
    shown: [Math.min(switchOn, fields.facePosition), Math.max(switchOn, fields.facePosition)],
  };
}
