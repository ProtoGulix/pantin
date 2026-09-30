import { encoder } from "./encoder/evaluate.ts";
import type { SensorInput, SensorOutput } from "./evaluation-common.ts";
import type { SensorFields } from "./schemas.ts";
import { evaluateSwitch } from "./switch-evaluation.ts";
import { switchOf } from "./zones.ts";

// Sensor evaluations (ADR 0023, ADR 0025), for the core only. A switch is
// evaluated from its zones (zones.ts); any other type has its own evaluation
// here. The core calls evaluateSensor and never names a type.

export type { SensorOutput } from "./evaluation-common.ts";

/** The sensor's tag values and new state, for the joint at this position. */
export function evaluateSensor(input: SensorInput<SensorFields>): SensorOutput {
  const { fields } = input;
  const asSwitch = switchOf(fields);
  if (asSwitch !== null) {
    return evaluateSwitch(asSwitch, input.position, input.state);
  }
  if (fields.type === "encoder") {
    return encoder.evaluate({ ...input, fields });
  }
  throw new Error(`Sensor type "${fields.type}" has neither zones nor an evaluation.`);
}
