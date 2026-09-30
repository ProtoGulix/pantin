import type { z } from "zod";
import type { SensorEvaluator } from "../evaluation-common.ts";
import type { PositionSwitchFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof PositionSwitchFieldsSchema>;

// Bounds included: a cylinder resting exactly on its end stop actuates the
// switch set at that end.
export const positionSwitch: SensorEvaluator<Fields> = {
  evaluate: ({ fields, position }) => {
    const [lower, upper] = fields.range;
    const actuated = position >= lower && position <= upper;
    return { state: actuated !== fields.normallyClosed ? 1 : 0 };
  },
};
