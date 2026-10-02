import type { ConsoleEntry, DriveDiagnostic } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";

// The wording of a console entry (ADR 0031 point 2): the core sends a code and
// its parameters, the translation files make the sentence (ADR 0010).

// Typed on the protocol's unions: a new diagnostic or fault must get its text.
const DIAGNOSTIC_KEYS = {
  conflicting_commands: "diagram.diagnostic.conflicting_commands",
} as const satisfies Record<DriveDiagnostic, MessageKey>;

const FAULT_KEYS = {
  unresponsive: "drives.fault.unresponsive",
  jammed: "drives.fault.jammed",
} as const satisfies Record<"unresponsive" | "jammed", MessageKey>;

export interface ConsoleWording {
  text: string;
  // Developer text the core could not translate (step_error), shown apart.
  detail: string | null;
}

export function consoleWording(entry: ConsoleEntry, t: Translate): ConsoleWording {
  switch (entry.code) {
    case "forced_tag_written":
      return { text: t("console.code.forced_tag_written", entry.params), detail: null };
    case "step_error":
      return { text: t("console.code.step_error"), detail: entry.params.detail };
    case "diagnostic_raised":
    case "diagnostic_cleared":
      return {
        text: t(`console.code.${entry.code}`, {
          diagnostic: t(DIAGNOSTIC_KEYS[entry.params.diagnostic]),
        }),
        detail: null,
      };
    case "fault_set":
    case "fault_cleared":
      return {
        text: t(`console.code.${entry.code}`, { fault: t(FAULT_KEYS[entry.params.fault]) }),
        detail: null,
      };
    case "migrated":
      return { text: t("console.code.migrated", entry.params), detail: null };
    case "clock_paused":
    case "clock_resumed":
    case "face_file_missing":
      return { text: t(`console.code.${entry.code}`), detail: null };
  }
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** Wall clock time of the entry in the viewer's time zone, "hh:mm:ss". */
export function clockTime(isoTime: string): string {
  const date = new Date(isoTime);
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(twoDigits).join(":");
}
