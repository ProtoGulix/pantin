import { z } from "zod";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// Single-acting cylinder: its coil extends it, a spring retracts it as soon
// as the coil falls.
export const SingleActingCylinderFieldsSchema = z.object({
  type: z.literal("single_acting_cylinder"),
  speed: positiveRate("speed"),
});

export const SINGLE_ACTING_CYLINDER_PARAMETERS = [
  { field: "speed", kind: "speed" },
] as const satisfies readonly DriveParameter[];

export const SINGLE_ACTING_CYLINDER_TAGS = [
  { member: "extend", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
