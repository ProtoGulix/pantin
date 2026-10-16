import { z } from "zod";
import {
  NORMALLY_CLOSED_PARAMETER,
  nonNegativeNumber,
  positiveNumber,
  type SensorParameter,
  SWITCH_TAGS,
} from "../schema-common.ts";

// A photoelectric cell (ADR 0043 point 7): a ray along +Z of its frame that
// sees products. A diffuse cell reads what it reflects within `range`; a
// through-beam barrier has its receiver `range` away. Both cast the same ray,
// the mode only changes what a client draws. Delays are in seconds.
const PHOTOELECTRIC_MODES = ["diffuse", "through_beam"] as const;

export const PhotoelectricFieldsSchema = z.object({
  type: z.literal("photoelectric"),
  mode: z.enum(PHOTOELECTRIC_MODES),
  range: positiveNumber("range"),
  normallyClosed: z.boolean(),
  onDelay: nonNegativeNumber("on delay"),
  offDelay: nonNegativeNumber("off delay"),
});

export const PHOTOELECTRIC_PARAMETERS = [
  { field: "mode", kind: "choice", options: PHOTOELECTRIC_MODES },
  { field: "range", kind: "length" },
  NORMALLY_CLOSED_PARAMETER,
  { field: "onDelay", kind: "duration" },
  { field: "offDelay", kind: "duration" },
] as const satisfies readonly SensorParameter[];

export const PHOTOELECTRIC_TAGS = SWITCH_TAGS;
