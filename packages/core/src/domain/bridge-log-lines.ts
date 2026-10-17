import { BRIDGE_MAX_LOG_LINE_CHARACTERS } from "@pantin/protocol";
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

// The line without its timestamp and level word: the console entry already
// says "warning", and the file has the full line.
export function consoleMessageOfBridgeLine(line: string): string {
  return line.replace(LEVEL_PATTERN, "").slice(0, MAX_CONSOLE_MESSAGE_CHARACTERS);
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
