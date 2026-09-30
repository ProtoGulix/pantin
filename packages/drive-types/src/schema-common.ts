import { z } from "zod";

// What every drive type's schema.ts uses: shapes of data only, no logic, since
// the protocol imports the schemas (ADR 0022 point 2). Units are SI, in the
// unit of the driven joints' coordinate (metre or radian).

/** A speed or an acceleration: finite and strictly positive. */
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
  // What a float tag measures, in the joints' unit: a position, or a speed
  // (per second). Clients show it in mm or degrees; a bit has none.
  quantity?: "position" | "speed";
}

// "speed" is per second, "acceleration" per second squared, of the joints'
// coordinate unit; clients show them in mm or degrees.
export type DriveParameterKind = "speed" | "acceleration";

export interface DriveParameter {
  field: string;
  kind: DriveParameterKind;
}

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
