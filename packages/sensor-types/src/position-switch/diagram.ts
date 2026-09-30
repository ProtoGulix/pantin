import type { z } from "zod";
import type { SwitchDiagram } from "../switch-zones.ts";
import type { PositionSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof PositionSwitchFieldsSchema>;

// No sensor body: the range itself, and where each bound is.
export function positionSwitchDiagram(fields: Fields): SwitchDiagram {
  const [lower, upper] = fields.range;
  return {
    symbol: { kind: "range", at: lower, facing: null },
    dimensions: [
      { kind: "position", at: lower, label: "range" },
      { kind: "position", at: upper, label: "range" },
    ],
  };
}
