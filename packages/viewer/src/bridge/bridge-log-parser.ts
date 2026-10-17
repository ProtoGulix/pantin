// The bridge log file as entries (ADR 0054 point 2). Pure: text in, entries out.
// The core writes "<ISO time> CORE <LEVEL> text" and "<ISO time> BRIDGE <line as
// the bridge wrote it>"; a line that starts otherwise (a traceback line, a line
// cut in two) belongs to the entry before it.

export type JournalLevel = "info" | "warning" | "error";
export type JournalSource = "core" | "bridge";

export interface JournalEntry {
  // The core's ISO 8601 time; null for lines found before any entry (a file cut at its start).
  time: string | null;
  source: JournalSource | null;
  level: JournalLevel;
  // The Python logger name, when the bridge line has the standard logging layout.
  logger: string | null;
  message: string;
  // The lines that followed without an entry prefix, in order.
  continuation: string[];
}

const ENTRY_LINE = /^(?<time>\d{4}-\d{2}-\d{2}T\S+) (?<source>CORE|BRIDGE)(?: (?<rest>.*))?$/;

// What Python's `logging` writes before the level: "2026-10-17 10:11:12,345".
// These mirror LEVEL_PATTERN in packages/core/src/domain/bridge-log-lines.ts (the
// viewer cannot import the core): change both together.
const BRIDGE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T][\d:.,]+(?:Z|[+-]\d{2}:?\d{2})?\s+/;
const LEVEL_WORD = /^(?<level>DEBUG|INFO|WARNING|ERROR|CRITICAL)\b[ \t]*/;
const LOGGER_NAME = /^(?<logger>[\w.-]+): /;

// Debug is shown as info and critical as error: the window has three levels.
const DISPLAY_LEVELS: Readonly<Record<string, JournalLevel>> = {
  DEBUG: "info",
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "error",
};

interface LevelAndText {
  level: JournalLevel;
  logger: string | null;
  message: string;
}

// Free text, with no level word, is info and kept whole: the file has the truth.
function withoutLevel(text: string): LevelAndText {
  return { level: "info", logger: null, message: text };
}

function levelAndTextOf(text: string, hasOwnTimestamp: boolean): LevelAndText {
  const afterTimestamp = hasOwnTimestamp ? text.replace(BRIDGE_TIMESTAMP, "") : text;
  const word = LEVEL_WORD.exec(afterTimestamp);
  const level = word?.groups?.level === undefined ? undefined : DISPLAY_LEVELS[word.groups.level];
  if (word === null || level === undefined) {
    return withoutLevel(text);
  }
  const afterLevel = afterTimestamp.slice(word[0].length);
  const logger = LOGGER_NAME.exec(afterLevel)?.groups?.logger ?? null;
  const message = logger === null ? afterLevel : afterLevel.slice(logger.length + 2);
  return { level, logger, message };
}

function entryOf(
  time: string,
  source: JournalSource,
  rest: string,
  hasOwnTimestamp: boolean,
): JournalEntry {
  return { time, source, ...levelAndTextOf(rest, hasOwnTimestamp), continuation: [] };
}

function parseEntryLine(line: string): JournalEntry | null {
  const match = ENTRY_LINE.exec(line);
  const { time, source, rest = "" } = match?.groups ?? {};
  if (time === undefined || source === undefined) {
    return null;
  }
  return entryOf(time, source === "CORE" ? "core" : "bridge", rest, source === "BRIDGE");
}

function orphanEntryOf(line: string): JournalEntry {
  return { time: null, source: null, ...withoutLevel(line), continuation: [] };
}

/** The file's entries, oldest first. Blank lines are dropped. */
export function parseBridgeLog(text: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") {
      continue;
    }
    const entry = parseEntryLine(line);
    const last = entries[entries.length - 1];
    if (entry !== null) {
      entries.push(entry);
    } else if (last === undefined) {
      entries.push(orphanEntryOf(line));
    } else {
      last.continuation.push(line);
    }
  }
  return entries;
}
