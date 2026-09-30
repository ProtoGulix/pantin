import { evaluateSensor } from "./evaluators.ts";
import type { Stroke } from "./schema-common.ts";
import type { SensorFields } from "./schemas.ts";

// Shared by the tests of this package: a sensor stepped along positions.

// The stroke the tests watch unless they say otherwise: a 100 mm cylinder.
export const TEST_STROKE: Stroke = [0, 0.1];

/** The state bit after each position, carrying the sensor's state from step to step. */
export function statesAlong(
  fields: SensorFields,
  positions: readonly number[],
  stroke: Stroke = TEST_STROKE,
): number[] {
  let state: Record<string, number> | null = null;
  return positions.map((position) => {
    const output = evaluateSensor({ fields, position, stroke, state });
    state = output.state;
    return output.values.state ?? Number.NaN;
  });
}
