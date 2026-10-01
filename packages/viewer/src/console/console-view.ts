import type { ConsoleEntry, ConsoleLevel, ConsoleSource, PantinDocument } from "@pantin/protocol";
import { type Language, pluralKey, type Translate } from "../i18n/translate.ts";
import { type ClientConsole, linesAfterClear } from "./console-list.ts";
import { consoleSourceLabel, consoleSourceTarget } from "./console-sources.ts";
import type { ConsoleState } from "./console-state.ts";
import { clockTime, consoleWording } from "./console-text.ts";

// The console panel and its toolbar counter as plain data (ADR 0031 point 5).

const CONSOLE_LEVELS: readonly ConsoleLevel[] = ["error", "warning", "info"];

export interface ConsoleLineView {
  // Stable across folds, so that a line keeps its place and focus when it repeats.
  key: string;
  time: string;
  level: ConsoleLevel;
  levelLabel: string;
  sourceLabel: string;
  text: string;
  detail: string | null;
  // "×12", only above one occurrence.
  repeat: string | null;
  // Simulation time, the tooltip of the line.
  title: string;
  // The source still exists: a click or Enter on the line selects it.
  activatable: boolean;
  source: ConsoleSource;
}

interface ConsoleFilterView {
  level: ConsoleLevel;
  label: string;
  pressed: boolean;
}

export interface ConsoleCounterView {
  errors: number;
  warnings: number;
  // The counts in words: the icons alone would say nothing to a screen reader.
  label: string;
}

export interface ConsoleView {
  open: boolean;
  counter: ConsoleCounterView;
  filters: ConsoleFilterView[];
  lines: ConsoleLineView[];
  canClear: boolean;
  // Why there is no line, or null when there is one.
  emptyText: string | null;
}

/**
 * Errors and warnings among the lines shown since the last "Effacer", counted
 * as lines, not occurrences: a diagnostic that flickers is one line whose
 * count grows, and must not make the counter run. The filters do not apply,
 * so that hiding a level in the panel never hides it from the toolbar.
 */
export function consoleCounter(
  list: ClientConsole,
  t: Translate,
  language: Language,
): ConsoleCounterView {
  const lines = linesAfterClear(list);
  const errors = lines.filter((entry) => entry.level === "error").length;
  const warnings = lines.filter((entry) => entry.level === "warning").length;
  const label = t("console.counter.label", {
    errors: t(pluralKey("console.counter.errors", errors, language), { count: errors }),
    warnings: t(pluralKey("console.counter.warnings", warnings, language), { count: warnings }),
  });
  return { errors, warnings, label };
}

function lineView(
  entry: ConsoleEntry,
  document: PantinDocument,
  pantinId: string,
  t: Translate,
): ConsoleLineView {
  const wording = consoleWording(entry, t);
  return {
    key: String(entry.firstSequence),
    time: clockTime(entry.wallTime),
    level: entry.level,
    levelLabel: t(`console.level.${entry.level}`),
    sourceLabel: consoleSourceLabel(document, entry.source, t),
    text: wording.text,
    detail: wording.detail,
    repeat: entry.count > 1 ? `×${entry.count}` : null,
    title: t("console.simulationTime", { seconds: entry.simulationTime.toFixed(2) }),
    activatable: consoleSourceTarget(document, pantinId, entry.source) !== null,
    source: entry.source,
  };
}

/** Null with no Pantin open: there is no console to show. */
export function buildConsoleView(
  state: ConsoleState,
  list: ClientConsole,
  open: { id: string; document: PantinDocument } | null,
  language: Language,
  t: Translate,
): ConsoleView | null {
  if (open === null) {
    return null;
  }
  const kept = linesAfterClear(list);
  const lines = kept
    .filter((entry) => !state.hiddenLevels.has(entry.level))
    .map((entry) => lineView(entry, open.document, open.id, t));
  const emptyKey = kept.length === 0 ? "console.empty" : "console.emptyFiltered";
  return {
    open: state.open,
    counter: consoleCounter(list, t, language),
    filters: CONSOLE_LEVELS.map((level) => ({
      level,
      label: t(`console.level.${level}`),
      pressed: !state.hiddenLevels.has(level),
    })),
    lines,
    canClear: kept.length > 0,
    emptyText: lines.length === 0 ? t(emptyKey) : null,
  };
}
