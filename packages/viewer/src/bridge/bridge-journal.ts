import { bridgeLogDownloadUrl } from "../api-bridge-routes.ts";
import type { Translate } from "../i18n/translate.ts";
import {
  type JournalEntry,
  type JournalLevel,
  type JournalSource,
  parseBridgeLog,
} from "./bridge-log-parser.ts";

// The bridge log window as plain data (ADR 0054 point 5): the file's text in,
// classified lines and texts out. Nothing here touches the page.

/** Older entries stay in the file and the download: a long log would slow the window down. */
export const JOURNAL_MAX_ENTRIES = 2000;

// Same order as the Pantin console's filters.
const JOURNAL_LEVELS: readonly JournalLevel[] = ["error", "warning", "info"];

export interface JournalEntryView {
  // Local HH:MM:SS.mmm, empty for lines found before any entry.
  time: string;
  // The full ISO time, the tooltip of the time.
  timeTitle: string;
  source: JournalSource | null;
  sourceLabel: string;
  level: JournalLevel;
  levelLabel: string;
  // The Python logger, the tooltip of the message: faint detail, not text to read.
  logger: string | null;
  message: string;
  continuation: readonly string[];
}

export interface JournalFilterView {
  level: JournalLevel;
  label: string;
  count: number;
  pressed: boolean;
}

export interface JournalModel {
  open: boolean;
  // The file as last read; null until the first read answers.
  text: string | null;
  // The reason the last read failed, in the core's words; null once a read works.
  error: string | null;
  reading: boolean;
  // A status arrived during a read: read again once it ends.
  stale: boolean;
  // Levels filtered out; kept when the window closes, like the console's.
  hiddenLevels: ReadonlySet<JournalLevel>;
}

export const CLOSED_JOURNAL: JournalModel = {
  open: false,
  text: null,
  error: null,
  reading: false,
  stale: false,
  hiddenLevels: new Set(),
};

export interface JournalView {
  pantinId: string;
  title: string;
  linesLabel: string;
  filtersLabel: string;
  copyLabel: string;
  copiedLabel: string;
  copyFailedLabel: string;
  downloadLabel: string;
  downloadUrl: string;
  closeLabel: string;
  filters: readonly JournalFilterView[];
  entries: readonly JournalEntryView[];
  // Shown above the entries when the oldest ones are cut.
  truncatedText: string | null;
  // Instead of the entries: no log yet, the first read still running, or all filtered out.
  placeholder: string | null;
  errorText: string | null;
  // The whole file, for the Copy button.
  copyText: string;
  // Changes when the window must be written again; cheaper than comparing the whole view.
  redrawKey: string;
}

function twoDigits(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** Local HH:MM:SS.mmm of an ISO time; an unreadable time is shown as written. */
export function localClockTime(isoTime: string): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) {
    return isoTime;
  }
  const clock = [date.getHours(), date.getMinutes(), date.getSeconds()].map((v) => twoDigits(v));
  return `${clock.join(":")}.${twoDigits(date.getMilliseconds(), 3)}`;
}

function entryViewOf(entry: JournalEntry, t: Translate): JournalEntryView {
  return {
    time: entry.time === null ? "" : localClockTime(entry.time),
    timeTitle: entry.time ?? "",
    source: entry.source,
    sourceLabel: entry.source === null ? "" : t(`bridge.journal.source.${entry.source}`),
    level: entry.level,
    levelLabel: t(`bridge.journal.level.${entry.level}`),
    logger: entry.logger,
    message: entry.message,
    continuation: entry.continuation,
  };
}

/** The file's entries, oldest first, cut to the last JOURNAL_MAX_ENTRIES. */
export function journalEntriesOf(text: string): { entries: JournalEntry[]; hiddenCount: number } {
  const all = parseBridgeLog(text);
  const hiddenCount = Math.max(0, all.length - JOURNAL_MAX_ENTRIES);
  return { entries: all.slice(hiddenCount), hiddenCount };
}

function filtersOf(
  entries: readonly JournalEntry[],
  hidden: ReadonlySet<JournalLevel>,
  t: Translate,
): JournalFilterView[] {
  return JOURNAL_LEVELS.map((level) => ({
    level,
    label: t(`console.level.${level}`),
    count: entries.filter((entry) => entry.level === level).length,
    pressed: !hidden.has(level),
  }));
}

function placeholderOf(model: JournalModel, entryCount: number, shownCount: number, t: Translate) {
  if (model.text === null) {
    // A failed first read says so in the error line instead of "loading".
    return model.error === null ? t("bridge.journal.loading") : null;
  }
  if (entryCount === 0) {
    return t("bridge.journal.empty");
  }
  return shownCount === 0 ? t("bridge.journal.emptyFiltered") : null;
}

function lastLineOf(text: string): string {
  return text.slice(text.trimEnd().lastIndexOf("\n") + 1);
}

function redrawKeyOf(model: JournalModel, view: Omit<JournalView, "redrawKey">): string {
  const text = model.text ?? "";
  // The file only grows, or restarts: its length and ends tell when it changed.
  return [
    view.title,
    view.errorText,
    view.placeholder,
    text.length,
    text.slice(0, text.indexOf("\n")),
    lastLineOf(text),
    [...model.hiddenLevels].sort().join(","),
  ].join("\u0000");
}

export function journalViewOf(
  model: JournalModel,
  pantinId: string | null,
  t: Translate,
): JournalView | null {
  if (!model.open || pantinId === null) {
    return null;
  }
  const { entries, hiddenCount } = journalEntriesOf(model.text ?? "");
  const shown = entries.filter((entry) => !model.hiddenLevels.has(entry.level));
  const view = {
    pantinId,
    title: t("bridge.journal.title"),
    linesLabel: t("bridge.journal.linesLabel"),
    filtersLabel: t("console.filters"),
    copyLabel: t("bridge.journal.copy"),
    copiedLabel: t("bridge.journal.copied"),
    copyFailedLabel: t("bridge.journal.copyFailed"),
    downloadLabel: t("bridge.journal.download"),
    downloadUrl: bridgeLogDownloadUrl(pantinId),
    closeLabel: t("bridge.journal.close"),
    filters: filtersOf(entries, model.hiddenLevels, t),
    entries: shown.map((entry) => entryViewOf(entry, t)),
    truncatedText: hiddenCount === 0 ? null : t("bridge.journal.truncated", { count: hiddenCount }),
    placeholder: placeholderOf(model, entries.length, shown.length, t),
    errorText: model.error === null ? null : t("bridge.journal.error", { message: model.error }),
    copyText: model.text ?? "",
  };
  return { ...view, redrawKey: redrawKeyOf(model, view) };
}

interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

// Sub-pixel scroll positions and a scrollbar's rounding must not count as "scrolled up".
const AT_END_TOLERANCE_PIXELS = 8;

/** True when the user reads the newest line: a refresh then follows the end. */
export function isScrolledToEnd(metrics: ScrollMetrics): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= AT_END_TOLERANCE_PIXELS;
}

/**
 * Where to scroll after the lines were replaced. The first display and a reader
 * at the end go to the end; a reader who scrolled up keeps their place.
 */
export function scrollTopAfterRefresh(
  before: ScrollMetrics | null,
  afterScrollHeight: number,
  afterClientHeight: number,
): number {
  if (before === null || isScrolledToEnd(before)) {
    return Math.max(0, afterScrollHeight - afterClientHeight);
  }
  return before.scrollTop;
}
