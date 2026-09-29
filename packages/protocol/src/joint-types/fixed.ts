import { z } from "zod";
import { type JointCoordinateUnit, jointFields } from "./common.ts";

// Encastrement: the child stays where it was imported, relative to its parent.
export const FixedJointRequestSchema = z.object({ type: z.literal("fixed"), ...jointFields });

export const FIXED_COORDINATE_UNIT: JointCoordinateUnit = null;
