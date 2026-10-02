import { z } from "zod";
import { Vector3Schema } from "./joint-types/common.ts";

// How far from 1 the length of a placement quaternion may be (ADR 0033
// point 8). The core normalises what it receives; a value this far off is a
// mistake in the caller, not rounding, so it is refused instead of fixed.
export const PLACEMENT_QUATERNION_TOLERANCE = 1e-6;

const UnitQuaternionSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine((quaternion) => quaternion.every(Number.isFinite), "Every component must be finite.")
  .refine(
    (quaternion) => Math.abs(Math.hypot(...quaternion) - 1) <= PLACEMENT_QUATERNION_TOLERANCE,
    `The rotation must be a unit quaternion (length 1, within ${PLACEMENT_QUATERNION_TOLERANCE}).`,
  );

// A rigid transform, same representation as a pose (ADR 0011 point 4):
// translation in metres, rotation as a unit quaternion [x, y, z, w]; rotate
// first, then translate.
export const PlacementSchema = z.object({
  translation: Vector3Schema,
  rotation: UnitQuaternionSchema,
});
export type Placement = z.infer<typeof PlacementSchema>;
