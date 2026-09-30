import { z } from "zod";

// What every sensor type's schema.ts uses: shapes of data only, no logic,
// since the protocol imports the schemas (ADR 0023 point 1). Values are SI,
// in the unit of the watched joint's coordinate (metre or radian).

// Seen from the PLC: a sensor only reports, so its tags are feedback.
export interface SensorTag {
  member: string;
  type: "bit" | "integer";
  direction: "feedback";
}

// How clients show and type a parameter (ADR 0025 point 4):
// - coordinateRange: two values of the joint coordinate (mm or degrees);
// - coordinate: one position or length along the joint coordinate;
// - pulsesPerUnit: pulses per mm or per degree;
// - percent: a number of percent;
// - choice: one of `options`, labelled in labels.ts;
// - flag: yes or no.
export type SensorParameterKind =
  | "coordinateRange"
  | "coordinate"
  | "pulsesPerUnit"
  | "percent"
  | "choice"
  | "flag";

export interface SensorParameter {
  field: string;
  kind: SensorParameterKind;
  // The values of a choice, in the order clients offer them.
  options?: readonly string[];
}

export type SensorLanguage = "en" | "fr";

/** The labels of one sensor type: parameters, tag members and choice options. */
export type SensorTypeLabels<
  Field extends string,
  Member extends string,
  Option extends string = never,
> = Readonly<
  Record<
    SensorLanguage,
    {
      name: string;
      parameters: Readonly<Record<Field, string>>;
      tags: Readonly<Record<Member, string>>;
      options?: Readonly<Record<Option, string>>;
      // Dimensions of the diagram that are not a parameter (ADR 0026 point 4).
      dimensions?: Readonly<Record<string, string>>;
    }
  >
>;

export const finiteNumber = (what: string) =>
  z.number().refine(Number.isFinite, `The ${what} must be a finite number.`);

export const positiveNumber = (what: string) =>
  finiteNumber(what).refine((value) => value > 0, `The ${what} must be greater than zero.`);

export const nonNegativeNumber = (what: string) =>
  finiteNumber(what).refine((value) => value >= 0, `The ${what} must not be negative.`);

// The watched joint's travel (ADR 0026): its limits, or null for a joint
// without end stops (continuous), whose angle a switch reads within one turn.
export type Stroke = readonly [number, number] | null;

export const FULL_TURN = 2 * Math.PI;

// Placement rules compare values typed in mm or degrees and converted to SI:
// 100 mm − 98 mm is not exactly 2 mm in floating point. A nanometre, or a
// nanoradian, is far below anything a machine resolves.
const PLACEMENT_TOLERANCE = 1e-9;

// The way the joint moves to actuate a switch: towards larger or smaller
// coordinates. Deduced from the stroke, never typed (ADR 0026 point 1).
export type Direction = "increasing" | "decreasing";

/** Towards the end of the stroke nearer to `position`; null at mid-stroke. */
export function towardsNearerEnd(
  position: number,
  [lower, upper]: readonly [number, number],
): Direction | null {
  const toUpper = upper - position;
  const toLower = position - lower;
  if (Math.abs(toUpper - toLower) <= PLACEMENT_TOLERANCE) {
    return null;
  }
  return toUpper < toLower ? "increasing" : "decreasing";
}

/** From the stroke towards a point on or beyond one of its ends; null inside the stroke. */
export function towardsOutside(
  position: number,
  [lower, upper]: readonly [number, number],
): Direction | null {
  if (position >= upper - PLACEMENT_TOLERANCE) {
    return "increasing";
  }
  return position <= lower + PLACEMENT_TOLERANCE ? "decreasing" : null;
}

/** Whether `length` exceeds `limit` by more than rounding. */
export function exceeds(length: number, limit: number): boolean {
  return length > limit + PLACEMENT_TOLERANCE;
}

/**
 * The way the joint moves to actuate a switch whose reference is `position`:
 * towards the nearer end. A refused placement (mid-stroke, no stroke) gets
 * "increasing", only so that it can still be drawn.
 */
export function actuationSide(position: number, stroke: Stroke): Direction {
  return (stroke === null ? null : towardsNearerEnd(position, stroke)) ?? "increasing";
}

// What a switch's placement against its joint's stroke must respect, beyond
// its own fields (ADR 0026): a message saying what to change, or null. A
// method, so that the registry (schemas.ts) compares it bivariantly.
export interface PlacementRule<Fields> {
  problem(fields: Fields, stroke: Stroke): string | null;
}

// The output every switch has: on or off, read the other way when normally closed.
export const SWITCH_TAGS = [
  { member: "state", type: "bit", direction: "feedback" },
] as const satisfies readonly SensorTag[];

export const NORMALLY_CLOSED_PARAMETER = {
  field: "normallyClosed",
  kind: "flag",
} as const satisfies SensorParameter;
