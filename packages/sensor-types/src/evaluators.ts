import { encoder } from "./encoder/evaluate.ts";
import type { SensorEvaluator, SensorInput } from "./evaluation-common.ts";
import { positionSwitch } from "./position-switch/evaluate.ts";
import type { SensorFields, SensorType } from "./schemas.ts";

// Registry of sensor evaluators (ADR 0023), for the core only. The record is
// keyed by type, so a type declared in schemas.ts without an evaluator here
// does not compile. The core calls evaluateSensor and never names a type.

const SENSOR_EVALUATORS: {
  readonly [Type in SensorType]: SensorEvaluator<Extract<SensorFields, { type: Type }>>;
} = {
  position_switch: positionSwitch,
  encoder,
};

// The entry for fields.type handles that type: the record's type above
// guarantees it. TypeScript accepts the lookup without a cast because method
// parameters are compared bivariantly (see SensorEvaluator).
function evaluatorOf(fields: SensorFields): SensorEvaluator<SensorFields> {
  return SENSOR_EVALUATORS[fields.type];
}

/** The sensor's tag values, by member, for the joint at this position. */
export function evaluateSensor(input: SensorInput<SensorFields>): Record<string, number> {
  return evaluatorOf(input.fields).evaluate(input);
}
