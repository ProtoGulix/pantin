import { describe, expect, it } from "vitest";
import { createTranslator, LANGUAGES } from "../i18n/translate.ts";
import { consoleExportFileName, consoleExportText } from "./console-export.ts";
import { answerOf, consolePantin, entryOf } from "./console-fixtures.ts";
import { EMPTY_CLIENT_CONSOLE, mergeConsoleResponse } from "./console-list.ts";
import { INITIAL_CONSOLE_STATE, withConsoleLevelToggled } from "./console-state.ts";
import { clockTime, consoleWording } from "./console-text.ts";
import { buildConsoleView } from "./console-view.ts";

const failure = entryOf(1, {
  code: "step_error",
  level: "error",
  source: { kind: "pantin" },
  params: { detail: "boom" },
  count: 3,
});
const diagnostic = entryOf(2);

function linesIn(language: "fr" | "en", hiddenError = false) {
  const state = hiddenError
    ? withConsoleLevelToggled(INITIAL_CONSOLE_STATE, "error")
    : INITIAL_CONSOLE_STATE;
  const list = mergeConsoleResponse(EMPTY_CLIENT_CONSOLE, answerOf([failure, diagnostic]));
  const view = buildConsoleView(state, list, consolePantin, language, createTranslator(language));
  if (view === null) {
    throw new Error("A Pantin is open: the view exists.");
  }
  return view.lines;
}

describe("the console as text", () => {
  it.each(LANGUAGES)("writes each line with the sentence the panel shows, in %s", (language) => {
    const t = createTranslator(language);
    const [first] = consoleExportText(linesIn(language)).split("\n");
    const wording = consoleWording(failure, t);
    expect(first).toBe(
      [
        clockTime(failure.wallTime),
        t("console.level.error"),
        // The source of a Pantin line is worded by the panel, whatever it says.
        linesIn(language)[0]?.sourceLabel,
        wording.text,
        `(${wording.detail})`,
        "×3",
      ]
        .filter((field) => field !== "")
        .join("  "),
    );
  });

  it("writes one line per console line, in order, ending with a line break", () => {
    const text = consoleExportText(linesIn("en"));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.trimEnd().split("\n")).toHaveLength(2);
  });

  it("leaves out what the level filters hide, as the panel does", () => {
    expect(consoleExportText(linesIn("en", true)).trimEnd().split("\n")).toHaveLength(1);
  });

  it("is empty without a line", () => {
    expect(consoleExportText([])).toBe("");
  });

  it("names the file after the Pantin", () => {
    expect(consoleExportFileName("press")).toBe("console-press.txt");
  });
});
