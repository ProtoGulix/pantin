import { z } from "zod";
import { JointIdSchema } from "./ids.ts";
import type { JointCoordinateUnit } from "./joint-types/common.ts";
import {
  CONTINUOUS_COORDINATE_UNIT,
  ContinuousJointRequestSchema,
} from "./joint-types/continuous.ts";
import { FIXED_COORDINATE_UNIT, FixedJointRequestSchema } from "./joint-types/fixed.ts";
import { PRISMATIC_COORDINATE_UNIT, PrismaticJointRequestSchema } from "./joint-types/prismatic.ts";
import { REVOLUTE_COORDINATE_UNIT, RevoluteJointRequestSchema } from "./joint-types/revolute.ts";

// Registry of joint types (ADR 0013). Each type lives in joint-types/<type>.ts;
// adding one means listing its request schema below and its coordinate unit
// in JOINT_COORDINATE_UNITS (the compiler asks for the latter).
// Steps: docs/guides/adding-a-joint-type.md.

export {
  type JointCoordinateUnit,
  LimitsSchema,
  type Vector3,
  Vector3Schema,
} from "./joint-types/common.ts";

// The core derives the id from the name, as for bodies.
export const CreateJointRequestSchema = z.discriminatedUnion("type", [
  FixedJointRequestSchema,
  PrismaticJointRequestSchema,
  RevoluteJointRequestSchema,
  ContinuousJointRequestSchema,
]);
export type CreateJointRequest = z.infer<typeof CreateJointRequestSchema>;

export const JointSchema = z.intersection(
  z.object({ id: JointIdSchema }),
  CreateJointRequestSchema,
);
export type Joint = z.infer<typeof JointSchema>;

export type JointType = Joint["type"];

// Unit of each joint type's coordinate: metres or radians, null when it
// cannot move. Positions, limits and tags of a joint are in this unit.
export const JOINT_COORDINATE_UNITS: Readonly<Record<JointType, JointCoordinateUnit>> = {
  fixed: FIXED_COORDINATE_UNIT,
  prismatic: PRISMATIC_COORDINATE_UNIT,
  revolute: REVOLUTE_COORDINATE_UNIT,
  continuous: CONTINUOUS_COORDINATE_UNIT,
};
