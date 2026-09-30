import { z } from "zod";
import {
  DOUBLE_ACTING_CYLINDER_PARAMETERS,
  DOUBLE_ACTING_CYLINDER_TAGS,
  DoubleActingCylinderFieldsSchema,
} from "./double-acting-cylinder/schema.ts";
import {
  MOTOR_ANALOG_PARAMETERS,
  MOTOR_ANALOG_TAGS,
  MotorAnalogFieldsSchema,
} from "./motor-analog/schema.ts";
import {
  MOTOR_ON_OFF_PARAMETERS,
  MOTOR_ON_OFF_TAGS,
  MotorOnOffFieldsSchema,
} from "./motor-on-off/schema.ts";
import type { DriveParameter, DriveTag } from "./schema-common.ts";
import {
  SERVO_AXIS_PARAMETERS,
  SERVO_AXIS_TAGS,
  ServoAxisFieldsSchema,
} from "./servo-axis/schema.ts";
import {
  SINGLE_ACTING_CYLINDER_PARAMETERS,
  SINGLE_ACTING_CYLINDER_TAGS,
  SingleActingCylinderFieldsSchema,
} from "./single-acting-cylinder/schema.ts";

// Registry of drive type schemas (ADR 0022), the only part of this package
// the protocol imports: data, no logic. Adding a type means adding its folder,
// then one entry here, in behaviours.ts and in labels.ts; the records below
// are keyed by type, so the compiler asks for them.

export type {
  DriveLanguage,
  DriveParameter,
  DriveParameterKind,
  DriveTag,
  DriveTagType,
  DriveTypeLabels,
} from "./schema-common.ts";

export const DriveFieldsSchema = z.discriminatedUnion("type", [
  DoubleActingCylinderFieldsSchema,
  SingleActingCylinderFieldsSchema,
  ServoAxisFieldsSchema,
  MotorAnalogFieldsSchema,
  MotorOnOffFieldsSchema,
]);
export type DriveFields = z.infer<typeof DriveFieldsSchema>;
export type DriveType = DriveFields["type"];

export const DRIVE_PARAMETERS: Readonly<Record<DriveType, readonly DriveParameter[]>> = {
  double_acting_cylinder: DOUBLE_ACTING_CYLINDER_PARAMETERS,
  single_acting_cylinder: SINGLE_ACTING_CYLINDER_PARAMETERS,
  servo_axis: SERVO_AXIS_PARAMETERS,
  motor_analog: MOTOR_ANALOG_PARAMETERS,
  motor_on_off: MOTOR_ON_OFF_PARAMETERS,
};

// The drive's own tags; the joints it moves keep their position feedback.
export const DRIVE_TAGS: Readonly<Record<DriveType, readonly DriveTag[]>> = {
  double_acting_cylinder: DOUBLE_ACTING_CYLINDER_TAGS,
  single_acting_cylinder: SINGLE_ACTING_CYLINDER_TAGS,
  servo_axis: SERVO_AXIS_TAGS,
  motor_analog: MOTOR_ANALOG_TAGS,
  motor_on_off: MOTOR_ON_OFF_TAGS,
};
