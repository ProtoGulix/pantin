import { DOUBLE_ACTING_CYLINDER_LABELS } from "./double-acting-cylinder/labels.ts";
import { MOTOR_ANALOG_LABELS } from "./motor-analog/labels.ts";
import { MOTOR_ON_OFF_LABELS } from "./motor-on-off/labels.ts";
import type { DriveLanguage } from "./schema-common.ts";
import type { DriveType } from "./schemas.ts";
import { SERVO_AXIS_LABELS } from "./servo-axis/labels.ts";
import { SINGLE_ACTING_CYLINDER_LABELS } from "./single-acting-cylinder/labels.ts";

// Registry of drive type labels, for clients (ADR 0022). Each type's own
// labels.ts is typed after its schema, so a missing label does not compile.

export interface DriveLabels {
  name: string;
  parameters: Readonly<Record<string, string>>;
  tags: Readonly<Record<string, string>>;
}

export const DRIVE_LABELS: Readonly<
  Record<DriveType, Readonly<Record<DriveLanguage, DriveLabels>>>
> = {
  double_acting_cylinder: DOUBLE_ACTING_CYLINDER_LABELS,
  single_acting_cylinder: SINGLE_ACTING_CYLINDER_LABELS,
  servo_axis: SERVO_AXIS_LABELS,
  motor_analog: MOTOR_ANALOG_LABELS,
  motor_on_off: MOTOR_ON_OFF_LABELS,
};
