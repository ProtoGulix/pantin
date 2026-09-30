import { z } from "zod";
import {
  AC_MOTOR_DEFAULT_FEED,
  AC_MOTOR_INPUT_PORTS,
  AC_MOTOR_PARAMETERS,
  AcMotorFieldsSchema,
} from "./ac-motor/schema.ts";
import {
  DOUBLE_ACTING_CYLINDER_DEFAULT_FEED,
  DOUBLE_ACTING_CYLINDER_INPUT_PORTS,
  DOUBLE_ACTING_CYLINDER_PARAMETERS,
  DoubleActingCylinderFieldsSchema,
} from "./double-acting-cylinder/schema.ts";
import type { ActuatorInputPort, ActuatorParameter, DefaultFeed } from "./schema-common.ts";
import {
  SERVO_MOTOR_DEFAULT_FEED,
  SERVO_MOTOR_INPUT_PORTS,
  SERVO_MOTOR_PARAMETERS,
  ServoMotorFieldsSchema,
} from "./servo-motor/schema.ts";
import {
  SINGLE_ACTING_CYLINDER_DEFAULT_FEED,
  SINGLE_ACTING_CYLINDER_INPUT_PORTS,
  SINGLE_ACTING_CYLINDER_PARAMETERS,
  SingleActingCylinderFieldsSchema,
} from "./single-acting-cylinder/schema.ts";

// Registry of the actuator types, for the protocol: data, no logic. Adding a
// type means adding its folder, then one entry here, in behaviours.ts and in
// labels.ts.

export const ActuatorFieldsSchema = z.discriminatedUnion("type", [
  DoubleActingCylinderFieldsSchema,
  SingleActingCylinderFieldsSchema,
  AcMotorFieldsSchema,
  ServoMotorFieldsSchema,
]);
export type ActuatorFields = z.infer<typeof ActuatorFieldsSchema>;
export type ActuatorType = ActuatorFields["type"];

export const ACTUATOR_PARAMETERS: Readonly<Record<ActuatorType, readonly ActuatorParameter[]>> = {
  double_acting_cylinder: DOUBLE_ACTING_CYLINDER_PARAMETERS,
  single_acting_cylinder: SINGLE_ACTING_CYLINDER_PARAMETERS,
  ac_motor: AC_MOTOR_PARAMETERS,
  servo_motor: SERVO_MOTOR_PARAMETERS,
};

export const ACTUATOR_INPUT_PORTS: Readonly<Record<ActuatorType, readonly ActuatorInputPort[]>> = {
  double_acting_cylinder: DOUBLE_ACTING_CYLINDER_INPUT_PORTS,
  single_acting_cylinder: SINGLE_ACTING_CYLINDER_INPUT_PORTS,
  ac_motor: AC_MOTOR_INPUT_PORTS,
  servo_motor: SERVO_MOTOR_INPUT_PORTS,
};

export const ACTUATOR_DEFAULT_FEEDS: Readonly<Record<ActuatorType, DefaultFeed>> = {
  double_acting_cylinder: DOUBLE_ACTING_CYLINDER_DEFAULT_FEED,
  single_acting_cylinder: SINGLE_ACTING_CYLINDER_DEFAULT_FEED,
  ac_motor: AC_MOTOR_DEFAULT_FEED,
  servo_motor: SERVO_MOTOR_DEFAULT_FEED,
};
