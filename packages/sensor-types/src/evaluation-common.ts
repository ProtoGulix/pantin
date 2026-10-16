import type { Stroke } from "./schema-common.ts";

// What every sensor evaluation uses (ADR 0025 point 1): the joint position,
// the joint's stroke, the sensor's state of the previous step, all plain
// numbers, so that a folder depends on this package alone.

type Values = Readonly<Record<string, number>>;

export interface SensorInput<Fields> {
  fields: Fields;
  // In the joint coordinate's unit (metre or radian).
  position: number;
  // The joint's limits, or null for a joint without end stops (ADR 0026).
  stroke: Stroke;
  // What the previous step returned; null before the first step.
  state: Values | null;
}

export interface SensorOutput {
  // Tag values, by member.
  values: Record<string, number>;
  state: Record<string, number>;
}

// The input of a presence sensor (ADR 0043 points 7 and 8): the raw signal the
// core worked out from a ray cast, no joint.
export interface PresenceSensorInput<Fields> {
  fields: Fields;
  // True when a product is within the sensor's reach this step.
  signal: boolean;
  // What the previous step returned; null before the first step.
  state: Values | null;
  stepSeconds: number;
}

// A method, not a function type: the registry (evaluators.ts) relies on
// method parameters being compared bivariantly, as for drive behaviours.
export interface SensorEvaluator<Fields> {
  evaluate(input: SensorInput<Fields>): SensorOutput;
}

export interface PresenceSensorEvaluator<Fields> {
  evaluate(input: PresenceSensorInput<Fields>): SensorOutput;
}

const INT32_RANGE = 2 ** 32;

/** Wraps a whole number to a 32-bit signed integer, as a PLC DINT counter does. */
export function wrapInt32(value: number): number {
  const wrapped = (((value + 2 ** 31) % INT32_RANGE) + INT32_RANGE) % INT32_RANGE;
  return wrapped - 2 ** 31;
}
