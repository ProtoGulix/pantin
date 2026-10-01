import type { ConsoleEntry } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { answerOf, consolePantin, entryOf } from "./console-fixtures.ts";
import {
  type ClientConsole,
  clearConsoleLines,
  EMPTY_CLIENT_CONSOLE,
  mergeConsoleResponse,
} from "./console-list.ts";
import { INITIAL_CONSOLE_STATE, withConsoleLevelToggled } from "./console-state.ts";
import { buildConsoleView, consoleCounter } from "./console-view.ts";

const t = createTranslator("fr");
const error = (sequence: number, overrides: { count?: number; firstSequence?: number } = {}) =>
  entryOf(sequence, {
    code: "step_error",
    level: "error",
    source: { kind: "pantin" },
    params: { detail: "boom" },
    ...overrides,
  });
const info = (sequence: number) => entryOf(sequence, { code: "diagnostic_cleared", level: "info" });

const read = (...entries: ConsoleEntry[]) =>
  mergeConsoleResponse(EMPTY_CLIENT_CONSOLE, answerOf(entries));
const view = (list: ClientConsole = read(), state = INITIAL_CONSOLE_STATE) => {
  const built = buildConsoleView(state, list, consolePantin, "fr", t);
  if (built === null) {
    throw new Error("A Pantin is open: the view exists.");
  }
  return built;
};

describe("the counter of errors and warnings", () => {
  it("counts lines, not occurrences: a folded line counts once", () => {
    const state = read(error(1, { count: 12 }), entryOf(2), info(3));
    expect(consoleCounter(state, t, "fr")).toMatchObject({ errors: 1, warnings: 1 });
  });

  it("starts over at Effacer, and counts a line that comes back after it", () => {
    const cleared = clearConsoleLines(read(error(1), entryOf(2)));
    expect(consoleCounter(cleared, t, "fr")).toMatchObject({ errors: 0, warnings: 0 });
    const later = mergeConsoleResponse(
      cleared,
      answerOf([error(3, { firstSequence: 1, count: 2 })]),
    );
    expect(consoleCounter(later, t, "fr")).toMatchObject({ errors: 1, warnings: 0 });
  });

  it("ignores the level filters and whether the console is open", () => {
    const state = withConsoleLevelToggled(INITIAL_CONSOLE_STATE, "error");
    expect(state.open).toBe(false);
    expect(view(read(error(1)), state).counter.errors).toBe(1);
    expect(view(read(error(1)), state).lines).toEqual([]);
  });

  it("says its counts in words, with plurals, in both locales", () => {
    const state = read(error(1), error(2, { firstSequence: 9 }), entryOf(3));
    expect(consoleCounter(state, t, "fr").label).toBe("Console : 2 erreurs, 1 avertissement");
    expect(consoleCounter(state, createTranslator("en"), "en").label).toBe(
      "Console: 2 errors, 1 warning",
    );
    // French counts 0 as singular, English as plural.
    expect(consoleCounter(read(), t, "fr").label).toBe("Console : 0 erreur, 0 avertissement");
    expect(consoleCounter(read(), createTranslator("en"), "en").label).toBe(
      "Console: 0 errors, 0 warnings",
    );
  });
});

describe("the console view", () => {
  it("is null with no Pantin open, and closed by default", () => {
    expect(buildConsoleView(INITIAL_CONSOLE_STATE, EMPTY_CLIENT_CONSOLE, null, "fr", t)).toBeNull();
    expect(view().open).toBe(false);
  });

  it("builds a line with time, level, source, message and repeat count, newest last", () => {
    const wallTime = new Date(2026, 9, 1, 14, 5, 9).toISOString();
    const built = view(read(entryOf(1, { wallTime, count: 12 }), info(2)));
    expect(built.lines[0]).toMatchObject({
      key: "1",
      time: "14:05:09",
      level: "warning",
      levelLabel: "Avertissement",
      sourceLabel: "v1",
      text: "Diagnostic : Commandes contradictoires.",
      detail: null,
      repeat: "×12",
      title: "Temps de simulation : 1.50 s",
      activatable: true,
    });
    expect(built.lines[1]?.repeat).toBeNull();
    expect(built.lines.map((line) => line.key)).toEqual(["1", "2"]);
  });

  it("shows the detail of a step error as developer text", () => {
    expect(view(read(error(1))).lines[0]).toMatchObject({ detail: "boom", sourceLabel: "Test" });
  });

  it("marks a line whose source was deleted as not activatable", () => {
    const gone = entryOf(1, { source: { kind: "drive", id: "gone" } });
    expect(view(read(gone)).lines[0]).toMatchObject({
      activatable: false,
      sourceLabel: "gone (supprimé)",
    });
  });
});

describe("the console view filters and clear point", () => {
  it("filters by level, with three toggles", () => {
    const list = read(error(1), entryOf(2), info(3));
    const toggled = withConsoleLevelToggled(INITIAL_CONSOLE_STATE, "warning");
    expect(view(list, toggled).filters.map((filter) => [filter.level, filter.pressed])).toEqual([
      ["error", true],
      ["warning", false],
      ["info", true],
    ]);
    expect(view(list, toggled).lines.map((line) => line.level)).toEqual(["error", "info"]);
    const back = withConsoleLevelToggled(toggled, "warning");
    expect(view(list, back).lines).toHaveLength(3);
  });

  it("hides the lines at Effacer, says so, and cannot clear an empty console", () => {
    const cleared = clearConsoleLines(read(error(1)));
    expect(view(cleared)).toMatchObject({
      lines: [],
      canClear: false,
      emptyText: "Rien à signaler pour ce Pantin.",
    });
    expect(view(read(error(1))).canClear).toBe(true);
  });

  it("tells an empty console from one emptied by the filters", () => {
    const filtered = withConsoleLevelToggled(INITIAL_CONSOLE_STATE, "info");
    expect(view(read(info(1)), filtered).emptyText).toBe("Aucune ligne pour les niveaux affichés.");
    expect(view(read(info(1))).emptyText).toBeNull();
  });
});
