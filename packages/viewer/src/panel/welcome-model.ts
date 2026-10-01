import type { PantinSummary } from "@pantin/protocol";
import { diagramShortcuts } from "../diagram/diagram-texts.ts";
import { type Language, pluralKey, type Translate } from "../i18n/translate.ts";
import { listShortcuts, type ShortcutListing } from "../menu/menu-model.ts";
import { viewModeOf } from "../session-state.ts";
import type { ViewerState, WelcomeTab } from "../viewer-state.ts";

// The welcome dialog (ADR 0027) as plain data: recent cards, the filtered
// list of "All Pantins", formatted dates. No DOM here, so it is unit tested.

export const RECENT_COUNT = 6;

export interface PantinListRowView {
  id: string;
  name: string;
  detail: string;
  selected: boolean;
}

export interface RecentCardView {
  id: string;
  name: string;
  bodies: string;
  modified: string;
}

export interface WelcomeView {
  visible: boolean;
  tab: WelcomeTab;
  // The name prompt of "Pantin vide" is open.
  creating: boolean;
  recents: RecentCardView[];
  rows: PantinListRowView[];
  filter: string;
  // Why "All Pantins" shows nothing, or null when it shows rows.
  emptyText: string | null;
  shortcuts: ShortcutListing[];
}

/** Date and short time in the viewer's language; empty if the core sent nothing valid. */
export function formatModifiedAt(iso: string, language: Language, timeZone?: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return "";
  }
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(time);
}

/** Most recently modified first; a date that cannot be read counts as the oldest. */
export function sortByModification(summaries: readonly PantinSummary[]): PantinSummary[] {
  const timeOf = (summary: PantinSummary) => {
    const time = Date.parse(summary.modifiedAt);
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
  };
  return [...summaries].sort((a, b) =>
    timeOf(a) === timeOf(b) ? a.name.localeCompare(b.name) : timeOf(b) - timeOf(a),
  );
}

/** Case-insensitive match on the name or the id; a blank filter keeps everything. */
export function filterSummaries(
  summaries: readonly PantinSummary[],
  filter: string,
): PantinSummary[] {
  const needle = filter.trim().toLowerCase();
  return summaries.filter(
    (summary) =>
      summary.name.toLowerCase().includes(needle) || summary.id.toLowerCase().includes(needle),
  );
}

/** Left and Right move between the tabs (there are two, so they wrap); Home and End jump. */
export function welcomeTabForKey(current: WelcomeTab, key: string): WelcomeTab | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowRight":
      return current === "home" ? "all" : "home";
    case "Home":
      return "home";
    case "End":
      return "all";
    default:
      return null;
  }
}

/** Where Tab or Shift+Tab lands among `count` controls, wrapping so focus stays inside. */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count === 0) {
    return -1;
  }
  if (current < 0) {
    return backwards ? count - 1 : 0;
  }
  return (current + (backwards ? count - 1 : 1)) % count;
}

function bodiesLabel(summary: PantinSummary, t: Translate, language: Language): string {
  const key = pluralKey("tree.bodyCount", summary.bodyCount, language);
  return t(key, { count: summary.bodyCount });
}

function buildRows(state: ViewerState, t: Translate): PantinListRowView[] {
  const matching = filterSummaries(sortByModification(state.pantins), state.welcomeFilter);
  return matching.map((summary) => ({
    id: summary.id,
    name: summary.name,
    detail: t("list.rowDetail", {
      id: summary.id,
      bodyCount: bodiesLabel(summary, t, state.language),
      date: formatModifiedAt(summary.modifiedAt, state.language),
    }),
    selected: summary.id === state.listSelectedPantinId,
  }));
}

function buildRecents(state: ViewerState, t: Translate): RecentCardView[] {
  return sortByModification(state.pantins)
    .slice(0, RECENT_COUNT)
    .map((summary) => ({
      id: summary.id,
      name: summary.name,
      bodies: bodiesLabel(summary, t, state.language),
      modified: formatModifiedAt(summary.modifiedAt, state.language),
    }));
}

function emptyText(state: ViewerState, rows: readonly PantinListRowView[], t: Translate) {
  if (rows.length > 0) {
    return null;
  }
  return t(state.pantins.length === 0 ? "welcome.all.empty" : "welcome.all.noMatch");
}

export function buildWelcomeView(state: ViewerState, t: Translate): WelcomeView {
  const visible = viewModeOf(state) === "list" && !state.welcomeHidden;
  const rows = visible ? buildRows(state, t) : [];
  return {
    visible,
    tab: state.welcomeTab,
    creating: state.creatingPantin,
    recents: visible ? buildRecents(state, t) : [],
    rows,
    filter: state.welcomeFilter,
    emptyText: visible ? emptyText(state, rows, t) : null,
    shortcuts: [...listShortcuts(t), ...diagramShortcuts(t)],
  };
}
