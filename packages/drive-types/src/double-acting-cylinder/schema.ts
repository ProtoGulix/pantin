import { z } from "zod";
import { type DriveParameter, type DriveTag, positiveRate } from "../schema-common.ts";

// Double-acting cylinder: one coil extends, the other retracts; with neither
// or both set it holds its position (CLAUDE.md section 5.3.1).
export const DoubleActingCylinderFieldsSchema = z.object({
  type: z.literal("double_acting_cylinder"),
  speed: positiveRate("speed"),
});

export const DOUBLE_ACTING_CYLINDER_PARAMETERS = [
  { field: "speed", kind: "speed" },
] as const satisfies readonly DriveParameter[];

export const DOUBLE_ACTING_CYLINDER_TAGS = [
  { member: "extend", type: "bit", direction: "command" },
  { member: "retract", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
