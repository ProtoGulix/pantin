import type { JointCoordinateUnit } from "@pantin/protocol";

// The one place where SI (what the core speaks) and display units (what the
// user sees: millimetres and degrees, CLAUDE.md section 5) are converted, like
// frames.ts does for the axes convention. No other module multiplies by 1000.

export type DisplayUnit = "mm" | "degree";

const MILLIMETRES_PER_METRE = 1000;
const DEGREES_PER_RADIAN = 180 / Math.PI;

export function metresToMillimetres(metres: number): number {
  return metres * MILLIMETRES_PER_METRE;
}

export function millimetresToMetres(millimetres: number): number {
  return millimetres / MILLIMETRES_PER_METRE;
}

export function radiansToDegrees(radians: number): number {
  return radians * DEGREES_PER_RADIAN;
}

export function degreesToRadians(degrees: number): number {
  return degrees / DEGREES_PER_RADIAN;
}

type CoordinateUnit = Exclude<JointCoordinateUnit, null>;

// Keyed by the protocol's units: a new coordinate unit does not compile until
// it has a display unit and its conversions here.
const DISPLAY_UNITS: Readonly<Record<CoordinateUnit, DisplayUnit>> = {
  metre: "mm",
  radian: "degree",
};

const TO_DISPLAY: Readonly<Record<CoordinateUnit, (value: number) => number>> = {
  metre: metresToMillimetres,
  radian: radiansToDegrees,
};

const FROM_DISPLAY: Readonly<Record<CoordinateUnit, (value: number) => number>> = {
  metre: millimetresToMetres,
  radian: degreesToRadians,
};

/** The display unit of a joint's coordinate; null when the joint cannot move. */
export function displayUnitOf(unit: JointCoordinateUnit): DisplayUnit | null {
  return unit === null ? null : DISPLAY_UNITS[unit];
}

/** A coordinate value (metre or radian) in display units; unchanged if there is no coordinate. */
export function coordinateToDisplay(unit: JointCoordinateUnit, value: number): number {
  return unit === null ? value : TO_DISPLAY[unit](value);
}

/** The inverse of coordinateToDisplay. */
export function coordinateFromDisplay(unit: JointCoordinateUnit, value: number): number {
  return unit === null ? value : FROM_DISPLAY[unit](value);
}

/** At most three decimals, no trailing zeros, never "-0": what a property grid shows. */
export function formatDisplayNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}
