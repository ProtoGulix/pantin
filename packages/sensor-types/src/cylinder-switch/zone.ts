import type { z } from "zod";
import type { SwitchZones } from "../switch-zones.ts";
import type { CylinderSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof CylinderSwitchFieldsSchema>;

// The window, and the window widened by the hysteresis on both sides.
export function cylinderSwitchZones(fields: Fields): SwitchZones {
  const half = fields.windowWidth / 2;
  const window = [fields.position - half, fields.position + half] as const;
  return {
    on: window,
    hold: [window[0] - fields.hysteresis, window[1] + fields.hysteresis],
    shown: window,
  };
}
