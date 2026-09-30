import { z } from "zod";

// What every drive type's schema.ts uses: shapes of data only, no logic, since
// the protocol imports the schemas (ADR 0022 point 2). Float values are SI
// in the unit of the driven joints' coordinate (metre or radian), except the
// percentages of a variable speed drive (ADR 0028 point 6).

/** A rate (speed, acceleration or ramp in percent per second): finite and strictly positive. */
export function positiveRate(what: string) {
  return z
    .number()
    .refine(Number.isFinite, `The ${what} must be a finite number.`)
    .refine((value) => value > 0, `The ${what} must be greater than zero.`);
}

export type DriveTagType = "bit" | "float";

// Seen from the PLC, as for joint tags (ADR 0012).
export interface DriveTag {
  member: string;
  type: DriveTagType;
  direction: "command" | "feedback";
  // What a float tag measures: a position or a speed (per second) in the
  // joints' unit, which clients show in mm or degrees; or a percent (of a
  // motor's nominal speed). A bit has none.
  quantity?: "position" | "speed" | "percent";
}

// "speed" is per second, "acceleration" per second squared, of the joints'
// coordinate unit; clients show them in mm or degrees. "percent_per_second" is
// a ramp in percent of a nominal speed per second (ADR 0028 point 6).
export type DriveParameterKind = "speed" | "acceleration" | "percent_per_second";

export interface DriveParameter {
  field: string;
  kind: DriveParameterKind;
}

/** Conditions a behaviour detects in the commands, as opposed to injected faults (ADR 0028 point 5). */
// Extend the union with each new diagnostic.
export type DriveDiagnostic = "conflicting_commands";

export type DriveLanguage = "en" | "fr";

/** The labels of one drive type, one entry per parameter and per tag member. */
export type DriveTypeLabels<Field extends string, Member extends string> = Readonly<
  Record<
    DriveLanguage,
    {
      name: string;
      parameters: Readonly<Record<Field, string>>;
      tags: Readonly<Record<Member, string>>;
    }
  >
>;
