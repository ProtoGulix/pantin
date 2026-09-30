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
    }
  >
>;

export const finiteNumber = (what: string) =>
  z.number().refine(Number.isFinite, `The ${what} must be a finite number.`);

export const positiveNumber = (what: string) =>
  finiteNumber(what).refine((value) => value > 0, `The ${what} must be greater than zero.`);

export const nonNegativeNumber = (what: string) =>
  finiteNumber(what).refine((value) => value >= 0, `The ${what} must not be negative.`);

// The way the joint moves to actuate a switch: towards larger or smaller coordinates.
export const DIRECTIONS = ["increasing", "decreasing"] as const;
export const DirectionSchema = z.enum(DIRECTIONS);

// The output every switch has: on or off, read the other way when normally closed.
export const SWITCH_TAGS = [
  { member: "state", type: "bit", direction: "feedback" },
] as const satisfies readonly SensorTag[];

export const NORMALLY_CLOSED_PARAMETER = {
  field: "normallyClosed",
  kind: "flag",
} as const satisfies SensorParameter;
