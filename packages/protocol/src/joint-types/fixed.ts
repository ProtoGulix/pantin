import { z } from "zod";
import { type JointCoordinateUnit, type JointParameter, jointFields } from "./common.ts";

// Encastrement: the child stays where it was imported, relative to its parent.
export const FixedJointRequestSchema = z.object({ type: z.literal("fixed"), ...jointFields });

export const FIXED_COORDINATE_UNIT: JointCoordinateUnit = null;

export const FIXED_PARAMETERS: readonly JointParameter[] = [];
