import type { z } from "zod";
import { actuationSide, type Stroke } from "../schema-common.ts";
import type { SwitchDiagram } from "../switch-zones.ts";
import type { LimitSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof LimitSwitchFieldsSchema>;

// The plunger at the end of its overtravel, looking back into the stroke.
export function limitSwitchDiagram(fields: Fields, stroke: Stroke): SwitchDiagram {
  const { operatingPosition: operating, differentialTravel, overtravel } = fields;
  const actuation = actuationSide(operating, stroke);
  const sign = actuation === "increasing" ? 1 : -1;
  const end = operating + sign * overtravel;
  const release = operating - sign * differentialTravel;
  return {
    symbol: {
      kind: "plunger",
      at: end,
      facing: actuation === "increasing" ? "decreasing" : "increasing",
    },
    dimensions: [
      { kind: "position", at: operating, label: "operatingPosition" },
      {
        kind: "length",
        from: Math.min(release, operating),
        to: Math.max(release, operating),
        label: "differentialTravel",
      },
      {
        kind: "length",
        from: Math.min(operating, end),
        to: Math.max(operating, end),
        label: "overtravel",
      },
    ],
  };
}
