// What every sensor type's evaluate.ts uses (ADR 0023 point 4): a sensor has
// no state, so its values are a pure function of the watched joint's
// position. Plain numbers only, so that a folder depends on this package alone.

export interface SensorInput<Fields> {
  fields: Fields;
  // In the joint coordinate's unit (metre or radian).
  position: number;
}

// A method, not a function type: the registry (evaluators.ts) relies on
// method parameters being compared bivariantly, as for drive behaviours.
export interface SensorEvaluator<Fields> {
  evaluate(input: SensorInput<Fields>): Record<string, number>;
}

const INT32_RANGE = 2 ** 32;

/** Wraps a whole number to a 32-bit signed integer, as a PLC DINT counter does. */
export function wrapInt32(value: number): number {
  const wrapped = (((value + 2 ** 31) % INT32_RANGE) + INT32_RANGE) % INT32_RANGE;
  return wrapped - 2 ** 31;
}
