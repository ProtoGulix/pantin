import { z } from "zod";
import {
  finiteNumber,
  NORMALLY_CLOSED_PARAMETER,
  nonNegativeNumber,
  positiveNumber,
  type SensorParameter,
  SWITCH_TAGS,
} from "../schema-common.ts";

// A magnetic cylinder sensor (reed or magnetoresistive, in the slot): on while
// the piston magnet is within its window along the stroke, off once it has
// left it by more than the hysteresis (spike 0006: about 1 mm).
export const CylinderSwitchFieldsSchema = z.object({
  type: z.literal("cylinder_switch"),
  // The centre of the window: where the sensor sits along the stroke.
  position: finiteNumber("position"),
  windowWidth: positiveNumber("window width"),
  hysteresis: nonNegativeNumber("hysteresis"),
  normallyClosed: z.boolean(),
});

export const CYLINDER_SWITCH_PARAMETERS = [
  { field: "position", kind: "coordinate" },
  { field: "windowWidth", kind: "coordinate" },
  { field: "hysteresis", kind: "coordinate" },
  NORMALLY_CLOSED_PARAMETER,
] as const satisfies readonly SensorParameter[];

export const CYLINDER_SWITCH_TAGS = SWITCH_TAGS;
