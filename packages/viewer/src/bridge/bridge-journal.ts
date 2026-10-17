import { bridgeLogDownloadUrl } from "../api-bridge-routes.ts";
import type { Translate } from "../i18n/translate.ts";

// The bridge log window as plain data (ADR 0054 point 5): the file's text in,
// classified lines and texts out. Nothing here touches the page.

/** Older lines stay in the file and the download: a long log would slow the window down. */
export const JOURNAL_MAX_LINES = 2000;

export type JournalLineLevel = "normal" | "warning" | "error";

export interface JournalLine {
  text: string;
  level: JournalLineLevel;
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
}

export const CLOSED_JOURNAL: JournalModel = {
  open: false,
  text: null,
  error: null,
  reading: false,
  stale: false,
};

export interface JournalView {
  pantinId: string;
  title: string;
  linesLabel: string;
  copyLabel: string;
  copiedLabel: string;
  copyFailedLabel: string;
  downloadLabel: string;
  downloadUrl: string;
  closeLabel: string;
  lines: readonly JournalLine[];
  // Shown above the lines when the oldest ones are cut.
  truncatedText: string | null;
  // Instead of the lines: no log yet, or the first read still running.
  placeholder: string | null;
  errorText: string | null;
  // The whole file, for the Copy button.
  copyText: string;
}

// "<ISO time> CORE <LEVEL> text" or "<ISO time> BRIDGE <line as written>", where
// a bridge line may start with its own timestamp before the level word.
const SOURCE_PREFIX = /^\S+ (?:CORE|BRIDGE) /;
const LEVEL_AFTER_TIMESTAMP = /^(?:\d[\d:,.\-+TZ ]*? )?(CRITICAL|ERROR|WARNING)\b/;

export function journalLevelOf(line: string): JournalLineLevel {
  const level = LEVEL_AFTER_TIMESTAMP.exec(line.replace(SOURCE_PREFIX, ""))?.[1];
  if (level === undefined) {
    return "normal";
  }
  return level === "WARNING" ? "warning" : "error";
}

/** The file's non-empty lines, oldest first, cut to the last JOURNAL_MAX_LINES. */
export function journalLinesOf(text: string): { lines: JournalLine[]; hiddenCount: number } {
  const all = text.split("\n").filter((line) => line.trim() !== "");
  const hiddenCount = Math.max(0, all.length - JOURNAL_MAX_LINES);
  const lines = all.slice(hiddenCount).map((line) => ({ text: line, level: journalLevelOf(line) }));
  return { lines, hiddenCount };
}

function placeholderOf(model: JournalModel, lineCount: number, t: Translate): string | null {
  if (model.text === null) {
    // A failed first read says so in the error line instead of "loading".
    return model.error === null ? t("bridge.journal.loading") : null;
  }
  return lineCount === 0 ? t("bridge.journal.empty") : null;
}

export function journalViewOf(
  model: JournalModel,
  pantinId: string | null,
  t: Translate,
): JournalView | null {
  if (!model.open || pantinId === null) {
    return null;
  }
  const { lines, hiddenCount } = journalLinesOf(model.text ?? "");
  return {
    pantinId,
    title: t("bridge.journal.title"),
    linesLabel: t("bridge.journal.linesLabel"),
    copyLabel: t("bridge.journal.copy"),
    copiedLabel: t("bridge.journal.copied"),
    copyFailedLabel: t("bridge.journal.copyFailed"),
    downloadLabel: t("bridge.journal.download"),
    downloadUrl: bridgeLogDownloadUrl(pantinId),
    closeLabel: t("bridge.journal.close"),
    lines,
    truncatedText: hiddenCount === 0 ? null : t("bridge.journal.truncated", { count: hiddenCount }),
    placeholder: placeholderOf(model, lines.length, t),
    errorText: model.error === null ? null : t("bridge.journal.error", { message: model.error }),
    copyText: model.text ?? "",
  };
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

/** The view changed in a way that needs the lines to be written again. */
export function journalRedrawKey(view: JournalView): string {
  return JSON.stringify(view);
}
