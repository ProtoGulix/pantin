import { z } from "zod";
import { type JointCoordinateUnit, jointFields, LimitsSchema } from "./common.ts";

// Pivot with end stops: rotation about the axis through the origin.
export const RevoluteJointRequestSchema = z.object({
  type: z.literal("revolute"),
  ...jointFields,
  limits: LimitsSchema,
});

export const REVOLUTE_COORDINATE_UNIT: JointCoordinateUnit = "radian";
