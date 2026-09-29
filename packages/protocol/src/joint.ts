import { z } from "zod";
import { BodyIdSchema, DisplayNameSchema, JointIdSchema } from "./ids.ts";

// A joint links a parent body to a child body (ADR 0011). Its origin and axis
// are expressed in the Pantin frame (Z up, metres) in the reference
// configuration, i.e. with every body where it was imported. Position 0 of a
// joint is that reference configuration.

export const Vector3Schema = z
  .tuple([z.number(), z.number(), z.number()])
  .refine((vector) => vector.every(Number.isFinite), "Every coordinate must be a finite number.");
export type Vector3 = z.infer<typeof Vector3Schema>;

const AxisSchema = Vector3Schema.refine(
  ([x, y, z]) => Math.hypot(x, y, z) > 1e-9,
  "The axis must not be the zero vector.",
);

// [lower, upper]: metres for a prismatic joint, radians for a revolute one.
const LimitsSchema = z
  .tuple([z.number(), z.number()])
  .refine(
    ([lower, upper]) => Number.isFinite(lower) && Number.isFinite(upper),
    "Limits must be finite numbers.",
  )
  .refine(([lower, upper]) => lower <= upper, "The lower limit must not exceed the upper one.");

const jointFields = {
  name: DisplayNameSchema,
  parent: BodyIdSchema,
  child: BodyIdSchema,
  origin: Vector3Schema,
  axis: AxisSchema,
};

// The member shapes without `id`, shared by the stored joint and the creation
// request, so that a new joint type is added in one place.
const jointMembers = {
  fixed: { type: z.literal("fixed"), ...jointFields },
  prismatic: { type: z.literal("prismatic"), ...jointFields, limits: LimitsSchema },
  revolute: { type: z.literal("revolute"), ...jointFields, limits: LimitsSchema },
  continuous: { type: z.literal("continuous"), ...jointFields },
};

export const JointTypeSchema = z.enum(["fixed", "prismatic", "revolute", "continuous"]);
export type JointType = z.infer<typeof JointTypeSchema>;

export const JointSchema = z.discriminatedUnion("type", [
  z.object({ id: JointIdSchema, ...jointMembers.fixed }),
  z.object({ id: JointIdSchema, ...jointMembers.prismatic }),
  z.object({ id: JointIdSchema, ...jointMembers.revolute }),
  z.object({ id: JointIdSchema, ...jointMembers.continuous }),
]);
export type Joint = z.infer<typeof JointSchema>;

// The core derives the id from the name, as for bodies.
export const CreateJointRequestSchema = z.discriminatedUnion("type", [
  z.object(jointMembers.fixed),
  z.object(jointMembers.prismatic),
  z.object(jointMembers.revolute),
  z.object(jointMembers.continuous),
]);
export type CreateJointRequest = z.infer<typeof CreateJointRequestSchema>;
