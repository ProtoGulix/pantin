import { z } from "zod";
import { type JointCoordinateUnit, jointFields, LimitsSchema } from "./common.ts";

// Glissière: translation along the axis, within the limits.
export const PrismaticJointRequestSchema = z.object({
  type: z.literal("prismatic"),
  ...jointFields,
  limits: LimitsSchema,
});

export const PRISMATIC_COORDINATE_UNIT: JointCoordinateUnit = "metre";
