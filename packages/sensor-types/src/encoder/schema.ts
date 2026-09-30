import { z } from "zod";
import type { SensorParameter, SensorTag } from "../schema-common.ts";

// An incremental encoder: the count a PLC counter input shows, from the
// joint's reference position.
export const EncoderFieldsSchema = z.object({
  type: z.literal("encoder"),
  // Pulses per metre or per radian of the joint's coordinate.
  pulsesPerUnit: z
    .number()
    .refine(Number.isFinite, "The pulses per unit must be a finite number.")
    .refine((value) => value > 0, "The pulses per unit must be greater than zero."),
});

export const ENCODER_PARAMETERS = [
  { field: "pulsesPerUnit", kind: "pulsesPerUnit" },
] as const satisfies readonly SensorParameter[];

export const ENCODER_TAGS = [
  { member: "count", type: "integer", direction: "feedback" },
] as const satisfies readonly SensorTag[];
