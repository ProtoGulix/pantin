import { AC_MOTOR_LABELS } from "./ac-motor/labels.ts";
import { DOUBLE_ACTING_CYLINDER_LABELS } from "./double-acting-cylinder/labels.ts";
import type { ActuatorLanguage } from "./schema-common.ts";
import type { ActuatorType } from "./schemas.ts";
import { SERVO_MOTOR_LABELS } from "./servo-motor/labels.ts";
import { SINGLE_ACTING_CYLINDER_LABELS } from "./single-acting-cylinder/labels.ts";

// Registry of actuator type labels, for clients. Each type's own labels.ts is
// typed after its schema, so a missing label does not compile.

export interface ActuatorLabels {
  name: string;
  parameters: Readonly<Record<string, string>>;
  ports: Readonly<Record<string, string>>;
}

export const ACTUATOR_LABELS: Readonly<
  Record<ActuatorType, Readonly<Record<ActuatorLanguage, ActuatorLabels>>>
> = {
  double_acting_cylinder: DOUBLE_ACTING_CYLINDER_LABELS,
  single_acting_cylinder: SINGLE_ACTING_CYLINDER_LABELS,
  ac_motor: AC_MOTOR_LABELS,
  servo_motor: SERVO_MOTOR_LABELS,
};
