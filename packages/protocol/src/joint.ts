import { z } from "zod";
import { JointIdSchema } from "./ids.ts";
import type { JointCoordinateUnit, JointParameter } from "./joint-types/common.ts";
import {
  CONTINUOUS_COORDINATE_UNIT,
  CONTINUOUS_PARAMETERS,
  ContinuousJointRequestSchema,
} from "./joint-types/continuous.ts";
import {
  FIXED_COORDINATE_UNIT,
  FIXED_PARAMETERS,
  FixedJointRequestSchema,
} from "./joint-types/fixed.ts";
import {
  HELICAL_COORDINATE_UNIT,
  HELICAL_PARAMETERS,
  HelicalJointRequestSchema,
} from "./joint-types/helical.ts";
import {
  PRISMATIC_COORDINATE_UNIT,
  PRISMATIC_PARAMETERS,
  PrismaticJointRequestSchema,
} from "./joint-types/prismatic.ts";
import {
  REVOLUTE_COORDINATE_UNIT,
  REVOLUTE_PARAMETERS,
  RevoluteJointRequestSchema,
} from "./joint-types/revolute.ts";

// Registry of joint types (ADR 0013). Each type lives in joint-types/<type>.ts;
// adding one means listing its request schema below, then its coordinate unit
// and its parameters in the records at the end (the compiler asks for them).
// Steps: docs/guides/adding-a-joint-type.md.

export {
  type JointCoordinateUnit,
  type JointParameter,
  type JointParameterKind,
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
  HelicalJointRequestSchema,
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
  helical: HELICAL_COORDINATE_UNIT,
};

// Type-specific parameters, for clients that build forms (ADR 0016).
export const JOINT_PARAMETERS: Readonly<Record<JointType, readonly JointParameter[]>> = {
  fixed: FIXED_PARAMETERS,
  prismatic: PRISMATIC_PARAMETERS,
  revolute: REVOLUTE_PARAMETERS,
  continuous: CONTINUOUS_PARAMETERS,
  helical: HELICAL_PARAMETERS,
};
