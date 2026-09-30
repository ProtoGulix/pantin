import type { z } from "zod";
import type { SwitchDiagram } from "../switch-zones.ts";
import type { CylinderSwitchFieldsSchema } from "./schema.ts";
import { cylinderWindow } from "./zone.ts";

type Fields = z.infer<typeof CylinderSwitchFieldsSchema>;

// The sensor in the slot at its position, its window, then the hysteresis past it.
export function cylinderSwitchDiagram(fields: Fields): SwitchDiagram {
  const [lower, upper] = cylinderWindow(fields);
  return {
    symbol: { kind: "slot", at: fields.position, facing: null },
    dimensions: [
      { kind: "position", at: fields.position, label: "position" },
      { kind: "length", from: lower, to: upper, label: "windowWidth" },
      { kind: "length", from: upper, to: upper + fields.hysteresis, label: "hysteresis" },
    ],
  };
}
