import { acMotor } from "./ac-motor/behaviour.ts";
import type {
  ActuatorBehaviour,
  ActuatorStepInput,
  ActuatorStepOutput,
} from "./behaviour-step-common.ts";
import { doubleActingCylinder } from "./double-acting-cylinder/behaviour.ts";
import type { ActuatorFields, ActuatorType } from "./schemas.ts";
import { servoMotor } from "./servo-motor/behaviour.ts";
import { singleActingCylinder } from "./single-acting-cylinder/behaviour.ts";

// Registry of the actuator behaviours, for the core only. The record is keyed
// by type, so a type declared in schemas.ts without a behaviour here does not
// compile.

export type { JointMotion } from "./behaviour-common.ts";
export type {
  ActuatorBehaviour,
  ActuatorStepInput,
  ActuatorStepOutput,
} from "./behaviour-step-common.ts";

const ACTUATOR_BEHAVIOURS: {
  readonly [Type in ActuatorType]: ActuatorBehaviour<Extract<ActuatorFields, { type: Type }>>;
} = {
  double_acting_cylinder: doubleActingCylinder,
  single_acting_cylinder: singleActingCylinder,
  ac_motor: acMotor,
  servo_motor: servoMotor,
};

// The entry for fields.type handles that type: the record's type above
// guarantees it. No cast: method parameters are compared bivariantly.
function behaviourOf(fields: ActuatorFields): ActuatorBehaviour<ActuatorFields> {
  return ACTUATOR_BEHAVIOURS[fields.type];
}

/** One simulation step of an actuator, whatever its type. */
export function stepActuator(input: ActuatorStepInput<ActuatorFields>): ActuatorStepOutput {
  return behaviourOf(input.fields).step(input);
}
