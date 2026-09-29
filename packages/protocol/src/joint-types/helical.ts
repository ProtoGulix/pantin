import { z } from "zod";
import { type JointCoordinateUnit, jointFields, LimitsSchema } from "./common.ts";

// Hélicoïdale (screw and nut): translation along the axis, with the rotation
// that the pitch imposes (ADR 0013 point 7). The coordinate is the
// translation, as for a slider.
export const HelicalJointRequestSchema = z.object({
  type: z.literal("helical"),
  ...jointFields,
  limits: LimitsSchema,
  // Travel per turn, in metres. Positive: right-hand thread, a positive
  // rotation about the axis advances along the axis.
  pitch: z
    .number()
    .refine(Number.isFinite, "The pitch must be a finite number.")
    // A near zero pitch would turn the nut by an infinite angle.
    .refine(
      (pitch) => Math.abs(pitch) > 1e-9,
      "The pitch must not be zero: use a revolute joint for a pure rotation.",
    ),
});

export const HELICAL_COORDINATE_UNIT: JointCoordinateUnit = "metre";
