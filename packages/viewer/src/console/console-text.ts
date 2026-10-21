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

const LOSS_REASON_KEYS = {
  closed: "console.reason.closed",
  timeout: "console.reason.timeout",
} as const satisfies Record<"closed" | "timeout", MessageKey>;

export interface ConsoleWording {
  text: string;
  // Developer text the core could not translate (step_error), shown apart.
  detail: string | null;
}

// The connection of a PLC module or of the bridge was lost, and why.
function connectionLossText(
  entry: Extract<ConsoleEntry, { code: "plc_disconnected" | "bridge_disconnected" }>,
  t: Translate,
): string {
  const reason = t(LOSS_REASON_KEYS[entry.params.reason]);
  return entry.code === "plc_disconnected"
    ? t("console.code.plc_disconnected", { module: entry.params.module, reason })
    : t("console.code.bridge_disconnected", { reason });
}

// The bodies that now follow their group are the detail of the line (ADR 0055 point 9).
function migratedWording(
  params: { from: number; to: number; followers?: string | undefined },
  t: Translate,
): ConsoleWording {
  return {
    text: t("console.code.migrated", { from: params.from, to: params.to }),
    detail:
      params.followers === undefined
        ? null
        : t("console.code.migrated.followers", { bodies: params.followers }),
  };
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
      return migratedWording(entry.params, t);
    case "clock_paused":
    case "clock_resumed":
    case "clock_paused_with_bridge":
    case "bridge_connected":
    case "face_file_missing":
      return { text: t(`console.code.${entry.code}`), detail: null };
    case "emitter_blocked":
    case "product_limit":
    case "sensor_changed":
    case "trace_dropped":
      return { text: t(`console.code.${entry.code}`, entry.params), detail: null };
    case "physics_rebuilt":
      return { text: t("console.code.physics_rebuilt", entry.params), detail: null };
    case "plc_connected":
      return { text: t("console.code.plc_connected", entry.params), detail: null };
    case "bridge_failed":
      return { text: t("console.code.bridge_failed"), detail: entry.params.message };
    case "bridge_log":
      return { text: t("console.code.bridge_log", entry.params), detail: null };
    case "plc_disconnected":
    case "bridge_disconnected":
      return { text: connectionLossText(entry, t), detail: null };
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
