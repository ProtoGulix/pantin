import type { z } from "zod";
import type { SwitchZones } from "../switch-zones.ts";
import type { CylinderSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof CylinderSwitchFieldsSchema>;

/** The window along the stroke, centred on the sensor. */
export function cylinderWindow(fields: Fields) {
  const half = fields.windowWidth / 2;
  return [fields.position - half, fields.position + half] as const;
}

// The window, and the window widened by the hysteresis on both sides. It does
// not depend on the stroke.
export function cylinderSwitchZones(fields: Fields): SwitchZones {
  const window = cylinderWindow(fields);
  return {
    on: window,
    hold: [window[0] - fields.hysteresis, window[1] + fields.hysteresis],
    shown: window,
  };
}
