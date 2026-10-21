import type { StatusTone } from "../bridge/module-connection.ts";
import type { IconName } from "../ui/icons.ts";

// ADR 0057 rule 4: one glyph per state, so that a colour is never the only cue.
// The stylesheet owns the colours; these are the shapes drawn next to them.

const TONE_GLYPHS: Readonly<Record<StatusTone, IconName>> = {
  ok: "check",
  busy: "state-busy",
  idle: "state-idle",
  error: "error",
};

export function glyphOfTone(tone: StatusTone): IconName {
  return TONE_GLYPHS[tone];
}

export type LogLevel = "error" | "warning" | "info" | "trace";

const LEVEL_GLYPHS: Readonly<Record<LogLevel, IconName>> = {
  error: "error",
  warning: "warning",
  info: "info",
  trace: "trace",
};

export function glyphOfLevel(level: LogLevel): IconName {
  return LEVEL_GLYPHS[level];
}
