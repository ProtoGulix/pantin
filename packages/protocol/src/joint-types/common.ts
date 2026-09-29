import { z } from "zod";
import { BodyIdSchema, DisplayNameSchema } from "../ids.ts";

// What every joint type shares (ADR 0011, ADR 0013). A joint links a parent
// body to a child body. Its origin and axis are expressed in the Pantin frame
// (Z up, metres) in the reference configuration, i.e. with every body where
// it was imported. Coordinate 0 of a joint is that reference configuration.

export const Vector3Schema = z
  .tuple([z.number(), z.number(), z.number()])
  .refine((vector) => vector.every(Number.isFinite), "Every coordinate must be a finite number.");
export type Vector3 = z.infer<typeof Vector3Schema>;

const AxisSchema = Vector3Schema.refine(
  ([x, y, z]) => Math.hypot(x, y, z) > 1e-9,
  "The axis must not be the zero vector.",
);

// [lower, upper], in the unit of the joint's coordinate.
export const LimitsSchema = z
  .tuple([z.number(), z.number()])
  .refine(
    ([lower, upper]) => Number.isFinite(lower) && Number.isFinite(upper),
    "Limits must be finite numbers.",
  )
  .refine(([lower, upper]) => lower <= upper, "The lower limit must not exceed the upper one.");

export const jointFields = {
  name: DisplayNameSchema,
  parent: BodyIdSchema,
  child: BodyIdSchema,
  origin: Vector3Schema,
  axis: AxisSchema,
};

// SI unit of a joint's single coordinate; null for a joint that cannot move.
export type JointCoordinateUnit = "metre" | "radian" | null;

// A type-specific parameter, described as data so that clients build their
// forms without testing the joint type (ADR 0016). Shared fields (name,
// parent, child, origin, axis) are not listed.
export type JointParameterKind =
  // [lower, upper] in the unit of the joint's coordinate.
  | "coordinateRange"
  // One length in metres.
  | "length";

export type JointParameter = { field: string; kind: JointParameterKind };
