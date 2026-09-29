import { z } from "zod";
import { type JointCoordinateUnit, type JointParameter, jointFields } from "./common.ts";

// Pivot without end stops: rotation about the axis through the origin.
export const ContinuousJointRequestSchema = z.object({
  type: z.literal("continuous"),
  ...jointFields,
});

export const CONTINUOUS_COORDINATE_UNIT: JointCoordinateUnit = "radian";

export const CONTINUOUS_PARAMETERS: readonly JointParameter[] = [];
