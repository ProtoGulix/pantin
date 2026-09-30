import { evaluateSensor } from "./evaluators.ts";
import type { SensorFields } from "./schemas.ts";

// Shared by the tests of this package: a sensor stepped along positions.

/** The state bit after each position, carrying the sensor's state from step to step. */
export function statesAlong(fields: SensorFields, positions: readonly number[]): number[] {
  let state: Record<string, number> | null = null;
  return positions.map((position) => {
    const output = evaluateSensor({ fields, position, state });
    state = output.state;
    return output.values.state ?? Number.NaN;
  });
}
