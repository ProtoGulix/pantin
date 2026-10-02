import type { PantinSummary } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { withPantinClosed, withWelcomeHidden } from "../session-state.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import {
  buildWelcomeView,
  filterSummaries,
  formatModifiedAt,
  nextFocusIndex,
  RECENT_COUNT,
  sortByModification,
  welcomeTabForKey,
} from "./welcome-model.ts";

const t = createTranslator("fr");

function summary(id: string, modifiedAt: string, bodyCount = 2): PantinSummary {
  return { id, name: id.toUpperCase(), bodyCount, modifiedAt };
}

const listing: ViewerState = { ...initialViewerState("fr"), pantins: pantinSummaries };

// The menus' shortcuts, then the diagram's keys.
const SHORTCUT_KEYS = [
  "Ctrl+S",
  "F2",
  "Suppr",
  "G",
  "R",
  "F8",
  "F4",
  "Flèches",
  "Entrée",
  "Espace",
  "Échap",
  "Début / Fin",
  "Suppr",
];

describe("dates", () => {
  it("formats date and short time in the viewer's language and time zone", () => {
    const iso = "2026-09-30T12:05:00.000Z";
    expect(formatModifiedAt(iso, "fr", "UTC")).toBe("30 sept. 2026, 12:05");
    expect(formatModifiedAt(iso, "en", "UTC")).toBe("Sep 30, 2026, 12:05 PM");
  });

  it("shows nothing for a date it cannot read", () => {
    expect(formatModifiedAt("yesterday", "fr")).toBe("");
  });
});

describe("sorting and filtering", () => {
  it("puts the latest modification first, unreadable dates last", () => {
    const sorted = sortByModification([
      summary("old", "2026-01-01T00:00:00Z"),
      summary("bad", "nope"),
      summary("new", "2026-09-01T00:00:00Z"),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["new", "old", "bad"]);
  });

  it("matches the name or the id, ignoring case and surrounding blanks", () => {
    const all = [summary("press", "2026-01-01T00:00:00Z"), summary("arm", "2026-01-01T00:00:00Z")];
    expect(filterSummaries(all, " PRE ").map((entry) => entry.id)).toEqual(["press"]);
    expect(filterSummaries(all, "").length).toBe(2);
    expect(filterSummaries(all, "zzz")).toEqual([]);
  });
});

describe("keyboard", () => {
  it("switches tabs with the arrows, Home and End", () => {
    expect(welcomeTabForKey("home", "ArrowRight")).toBe("all");
    expect(welcomeTabForKey("all", "ArrowLeft")).toBe("home");
    expect(welcomeTabForKey("all", "Home")).toBe("home");
    expect(welcomeTabForKey("home", "End")).toBe("all");
    expect(welcomeTabForKey("home", "a")).toBeNull();
  });

  it("wraps Tab and Shift+Tab inside the dialog", () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(3, 1, false)).toBe(2);
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
  });
});

describe("welcome view", () => {
  it("is visible with no Pantin open, and hidden by the user or by an open Pantin", () => {
    expect(buildWelcomeView(listing, t).visible).toBe(true);
    expect(buildWelcomeView(withWelcomeHidden(listing), t).visible).toBe(false);
    const open = withOpenPantin(listing, pantinResponse(false));
    expect(buildWelcomeView(open, t).visible).toBe(false);
    expect(buildWelcomeView(withPantinClosed(withWelcomeHidden(open)), t).visible).toBe(true);
  });

  it("caps the recent cards at six, most recent first, with body count and date", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      summary(`p${index}`, `2026-09-0${index + 1}T10:00:00Z`, index === 8 ? 1 : 3),
    );
    const view = buildWelcomeView({ ...listing, pantins: many }, t);
    expect(view.recents).toHaveLength(RECENT_COUNT);
    expect(view.recents[0]).toMatchObject({ id: "p8", bodies: "1 corps" });
    expect(view.recents[0]?.modified).toBe(formatModifiedAt("2026-09-09T10:00:00Z", "fr"));
    expect(view.recents[1]).toMatchObject({ id: "p7", bodies: "3 corps" });
  });

  it("lists every Pantin sorted, with the date in the detail and the selection", () => {
    const view = buildWelcomeView({ ...listing, listSelectedPantinId: "press" }, t);
    expect(view.rows.map((row) => [row.id, row.selected])).toEqual([
      ["robot", false],
      ["press", true],
    ]);
    expect(view.rows[0]?.detail).toBe(
      `robot · 4 corps · ${formatModifiedAt("2026-09-30T12:00:00.000Z", "fr")}`,
    );
    expect(view.emptyText).toBeNull();
  });

  it("filters the list and says why it is empty", () => {
    const filtered = buildWelcomeView({ ...listing, welcomeFilter: "rob" }, t);
    expect(filtered.rows.map((row) => row.id)).toEqual(["robot"]);
    expect(filtered.recents).toHaveLength(2);
    expect(buildWelcomeView({ ...listing, welcomeFilter: "zzz" }, t).emptyText).toContain(
      "correspond",
    );
    expect(buildWelcomeView({ ...listing, pantins: [] }, t).emptyText).toContain("Aucun Pantin");
  });

  it("carries the tab, the name prompt state and the shortcuts", () => {
    const view = buildWelcomeView({ ...listing, welcomeTab: "all", creatingPantin: true }, t);
    expect(view).toMatchObject({ tab: "all", creating: true });
    expect(view.shortcuts.map((entry) => entry.keys)).toEqual(SHORTCUT_KEYS);
  });
});
