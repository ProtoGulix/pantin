import type { DriveBehaviour, DriveStepInput, DriveStepOutput } from "./behaviour-common.ts";
import { doubleActingCylinder } from "./double-acting-cylinder/behaviour.ts";
import { motorAnalog } from "./motor-analog/behaviour.ts";
import { motorOnOff } from "./motor-on-off/behaviour.ts";
import type { DriveFields, DriveType } from "./schemas.ts";
import { servoAxis } from "./servo-axis/behaviour.ts";
import { singleActingCylinder } from "./single-acting-cylinder/behaviour.ts";

// Registry of drive type behaviours (ADR 0022), for the core only. The record
// is keyed by type, so a type declared in schemas.ts without a behaviour here
// does not compile. The core calls stepDrive and never names a drive type.

export type {
  DriveStepInput,
  DriveStepOutput,
  JointMotion,
} from "./behaviour-common.ts";

const DRIVE_BEHAVIOURS: {
  readonly [Type in DriveType]: DriveBehaviour<Extract<DriveFields, { type: Type }>>;
} = {
  double_acting_cylinder: doubleActingCylinder,
  single_acting_cylinder: singleActingCylinder,
  servo_axis: servoAxis,
  motor_analog: motorAnalog,
  motor_on_off: motorOnOff,
};

// The entry for fields.type handles that type: the record's type above
// guarantees it. TypeScript accepts the lookup without a cast because method
// parameters are compared bivariantly (see DriveBehaviour).
function behaviourOf(fields: DriveFields): DriveBehaviour<DriveFields> {
  return DRIVE_BEHAVIOURS[fields.type];
}

/** One simulation step of a drive, whatever its type. */
export function stepDrive(input: DriveStepInput<DriveFields>): DriveStepOutput {
  return behaviourOf(input.fields).step(input);
}
