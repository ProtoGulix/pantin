import type { z } from "zod";
import { actuationSide, type Stroke } from "../schema-common.ts";
import type { SwitchDiagram } from "../switch-zones.ts";
import type { InductiveSwitchFieldsSchema } from "./schema.ts";
import { inductiveDistances } from "./zone.ts";

type Fields = z.infer<typeof InductiveSwitchFieldsSchema>;

// The face looking at the stroke, the effective distance in front of it, then
// the hysteresis.
export function inductiveSwitchDiagram(fields: Fields, stroke: Stroke): SwitchDiagram {
  const { reach, release } = inductiveDistances(fields);
  const face = fields.facePosition;
  const approach = actuationSide(face, stroke);
  const sign = approach === "increasing" ? 1 : -1;
  const switchOn = face - sign * reach;
  const switchOff = face - sign * release;
  return {
    symbol: {
      kind: "face",
      at: face,
      facing: approach === "increasing" ? "decreasing" : "increasing",
    },
    dimensions: [
      { kind: "position", at: face, label: "facePosition" },
      {
        kind: "length",
        from: Math.min(switchOn, face),
        to: Math.max(switchOn, face),
        label: "reach",
      },
      {
        kind: "length",
        from: Math.min(switchOff, switchOn),
        to: Math.max(switchOff, switchOn),
        label: "hysteresisPercent",
      },
    ],
  };
}
