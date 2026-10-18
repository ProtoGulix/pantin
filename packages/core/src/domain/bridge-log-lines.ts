import { BRIDGE_MAX_LOG_LINE_CHARACTERS, type ConsoleEvent } from "@pantin/protocol";
import type { BridgeEvent, BridgeMachineState } from "./bridge-state.ts";

// The lines of the bridge log file (ADR 0054 point 2) and the level of a line
// the bridge wrote (point 1). Pure: the time comes in as an argument.

export type BridgeLogLevel = "debug" | "info" | "warning" | "error";

const MAX_CONSOLE_MESSAGE_CHARACTERS = 300;

// What Python's `logging` writes: an optional timestamp (the bridge's own
// format is "2026-10-17 10:11:12,345" or ISO 8601), then the level word.
const LEVEL_PATTERN =
  /^(?<timestamp>\d{4}-\d{2}-\d{2}[ T][\d:.,]+(?:Z|[+-]\d{2}:?\d{2})?\s+)?(?<level>DEBUG|INFO|WARNING|ERROR|CRITICAL)\b\s*/;

const LEVELS: Record<string, BridgeLogLevel> = {
  DEBUG: "debug",
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "error",
};

// Any line that does not start like that is `info`: a traceback line or the
// output of a bridge in another language must not be taken for a warning.
export function classifyBridgeLine(line: string): BridgeLogLevel {
  const level = LEVEL_PATTERN.exec(line)?.groups?.level;
  return (level === undefined ? undefined : LEVELS[level]) ?? "info";
}

// The logger name Python's layout puts after the level ("pantin_bridge.modbus_journal: ").
// Only dropped after a Python timestamp: without one, "Word: " may be the message itself.
const LOGGER_NAME = /^[\w.-]+: /;

// The line without its timestamp, level word and logger name: the console entry
// already says "warning", and the file has the full line (ADR 0054, 2026-10-17 amendment).
export function consoleMessageOfBridgeLine(line: string): string {
  const match = LEVEL_PATTERN.exec(line);
  const rest = match === null ? line : line.slice(match[0].length);
  const message = match?.groups?.timestamp === undefined ? rest : rest.replace(LOGGER_NAME, "");
  return message.slice(0, MAX_CONSOLE_MESSAGE_CHARACTERS);
}

export function shouldReachConsole(level: BridgeLogLevel): boolean {
  return level === "warning" || level === "error";
}

function cut(text: string): string {
  return text.length > BRIDGE_MAX_LOG_LINE_CHARACTERS
    ? text.slice(0, BRIDGE_MAX_LOG_LINE_CHARACTERS)
    : text;
}

export function formatCoreLogLine(time: Date, level: BridgeLogLevel, text: string): string {
  return cut(`${time.toISOString()} CORE ${level.toUpperCase()} ${text}`);
}

export function formatBridgeLogLine(time: Date, line: string): string {
  return cut(`${time.toISOString()} BRIDGE ${line}`);
}

export type CoreLogEntry = { level: BridgeLogLevel; text: string };

// What the core says about a change of the bridge's state; undefined when the
// event changed nothing worth a line (a late event of an old child).
export function describeBridgeTransition(
  before: BridgeMachineState,
  after: BridgeMachineState,
  event: BridgeEvent,
  network: { listen: string; allow: readonly string[] } | null,
): CoreLogEntry | undefined {
  if (after.phase === "failed" && before.phase !== "failed") {
    const { kind, message } = after.failure;
    return { level: "error", text: `Bridge failed (${kind}): ${message}` };
  }
  if (event.type === "start_requested" && after.phase === "starting") {
    const allow =
      network === null || network.allow.length === 0 ? "none" : network.allow.join(", ");
    return {
      level: "info",
      text: `Start requested: listen ${network?.listen ?? "?"}, allow ${allow}.`,
    };
  }
  if (event.type === "ready" && after.phase === "running") {
    const modules = after.modules.map(({ key, port }) => `${key}:${port}`).join(", ");
    return { level: "info", text: `Bridge ready: modules ${modules === "" ? "none" : modules}.` };
  }
  if (event.type === "stop_requested" && after.phase === "stopping") {
    return { level: "info", text: "Stop requested." };
  }
  if (after.phase === "stopped" && before.phase === "stopping") {
    return { level: "info", text: "Bridge stopped." };
  }
  return undefined;
}

const LOSS_REASONS = {
  closed: "its connection closed",
  timeout: "no request within its watchdog time",
};

// What the core says in the bridge log about a console event of the PLC link
// (ADR 0054, amendment of 2026-10-18). The bridge no longer echoes the core's
// console, so the core writes these lines itself, at the event's own level.
// `bridge_failed` is left out (the supervisor logs that transition) and so is
// `bridge_log` (it comes from this very log: writing it back would loop).
export function describePlcLinkEvent(event: ConsoleEvent): CoreLogEntry | undefined {
  switch (event.code) {
    case "forced_tag_written": {
      const { tag, forcedValue, writtenValue } = event.params;
      return {
        level: event.level,
        text: `PLC write ignored on forced tag ${tag} (forced ${forcedValue}, PLC wrote ${writtenValue}).`,
      };
    }
    case "plc_connected":
      return { level: event.level, text: `PLC connected to module ${event.params.module}.` };
    case "plc_disconnected": {
      const { module, reason } = event.params;
      return {
        level: event.level,
        text: `PLC disconnected from module ${module}: ${LOSS_REASONS[reason]}.`,
      };
    }
    case "bridge_connected":
      return { level: event.level, text: "Bridge connected to the tag bus." };
    case "bridge_disconnected":
      return {
        level: event.level,
        text: `Bridge disconnected from the tag bus: ${LOSS_REASONS[event.params.reason]}.`,
      };
    default:
      return undefined;
  }
}
