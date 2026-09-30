import type { DriveDiagnostic, DriveRuntime, DriveType } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";

// Diagnostics of a drive (ADR 0028 point 5) as lines to show on its card. The
// core detects them; the viewer only words them, and never computes one.

export interface DiagnosticLine {
  // The technical id, kept as a detail (tooltip) next to the translated text.
  id: DriveDiagnostic;
  text: string;
}

type WordingFamily = "valve" | "contactor" | "neutral";

// A valve has coils and a spool, a contactor has neither. Exhaustive on the
// drive types: a new type must choose its wording here. Types that raise no
// diagnostic yet take a neutral wording, true of any drive, so that one
// starting to raise it is never described with coils it does not have.
const WORDING_FAMILIES = {
  valve_3_2_single: "valve",
  valve_double_3_2: "valve",
  valve_5_2_single: "valve",
  valve_5_2_double: "valve",
  valve_5_3_closed: "valve",
  valve_5_3_exhaust: "valve",
  valve_5_3_pressure: "valve",
  reversing_contactor: "contactor",
  contactor: "contactor",
  servo_drive: "neutral",
  vfd_analog: "neutral",
  vfd_on_off: "neutral",
} as const satisfies Record<DriveType, WordingFamily>;

// Typed on the diagnostic union: a new diagnostic must get its texts here.
const DIAGNOSTIC_KEYS = {
  conflicting_commands: {
    valve: "drives.diagnostic.conflicting_commands.valve",
    contactor: "drives.diagnostic.conflicting_commands.contactor",
    neutral: "drives.diagnostic.conflicting_commands.neutral",
  },
} as const satisfies Record<DriveDiagnostic, Record<WordingFamily, MessageKey>>;

export function diagnosticLines(
  diagnostics: readonly DriveDiagnostic[],
  driveType: DriveType,
  t: Translate,
): DiagnosticLine[] {
  const family = WORDING_FAMILIES[driveType];
  return diagnostics.map((id) => ({ id, text: t(DIAGNOSTIC_KEYS[id][family]) }));
}

export interface DiagnosticUpdate {
  signature: string;
  lines: DiagnosticLine[];
}

/**
 * What to draw on a card after a tag read, or null when it already shows it.
 * The tag read runs four times a second: redrawing an unchanged warning would
 * make screen readers announce it again and drop the tooltip under the pointer.
 */
export function nextDiagnosticUpdate(
  shownSignature: string,
  diagnostics: readonly DriveDiagnostic[],
  driveType: DriveType,
  t: Translate,
): DiagnosticUpdate | null {
  const lines = diagnosticLines(diagnostics, driveType, t);
  const signature = lines.map((line) => `${line.id}:${line.text}`).join("|");
  return signature === shownSignature ? null : { signature, lines };
}

/** The drives' latest runtime by drive id, as the store keeps it for the panel and the diagram. */
export function runtimeByDriveId(
  drives: readonly DriveRuntime[],
): ReadonlyMap<string, DriveRuntime> {
  return new Map(drives.map((drive) => [drive.id, drive]));
}
