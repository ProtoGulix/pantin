import type { z } from "zod";
import { type SensorEvaluator, wrapInt32 } from "../evaluation-common.ts";
import type { EncoderFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof EncoderFieldsSchema>;

// The count since the reference position, to the nearest pulse, wrapped like
// a PLC counter. A position exactly halfway between two pulses rounds up
// (Math.round), whichever side of the reference it is on.
export const encoder: SensorEvaluator<Fields> = {
  evaluate: ({ fields, position }) => ({
    count: wrapInt32(Math.round(position * fields.pulsesPerUnit)),
  }),
};
