import type { ConsoleEntry } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator, LANGUAGES } from "../i18n/translate.ts";
import { entryOf } from "./console-fixtures.ts";
import { clockTime, consoleWording } from "./console-text.ts";

const forced = entryOf(1, {
  code: "forced_tag_written",
  level: "error",
  source: { kind: "pantin" },
  params: { tag: "press.valve.extend", forcedValue: 1, writtenValue: 0 },
});
const entries: Record<ConsoleEntry["code"], ConsoleEntry> = {
  forced_tag_written: forced,
  step_error: entryOf(2, {
    code: "step_error",
    level: "error",
    source: { kind: "pantin" },
    params: { detail: "Cannot read properties of undefined" },
  }),
  diagnostic_raised: entryOf(3),
  diagnostic_cleared: entryOf(4, { code: "diagnostic_cleared", level: "info" }),
  fault_set: entryOf(5, {
    code: "fault_set",
    level: "info",
    source: { kind: "joint", id: "j1" },
    params: { fault: "jammed" },
  }),
  fault_cleared: entryOf(6, {
    code: "fault_cleared",
    level: "info",
    source: { kind: "drive", id: "v1" },
    params: { fault: "unresponsive" },
  }),
  migrated: entryOf(7, {
    code: "migrated",
    level: "info",
    source: { kind: "pantin" },
    params: { from: 1, to: 2 },
  }),
};

const expected = {
  fr: {
    forced_tag_written:
      "Écriture de l'automate ignorée sur le tag forcé press.valve.extend : forcé à 1, l'automate a écrit 0.",
    step_error: "Erreur dans le pas de simulation : le pas est ignoré.",
    diagnostic_raised: "Diagnostic : Commandes contradictoires.",
    diagnostic_cleared: "Diagnostic résolu : Commandes contradictoires.",
    fault_set: "Défaut injecté : Grippée.",
    fault_cleared: "Défaut retiré : Ne répond plus.",
    migrated: "Document migré à l'ouverture, de la version 1 à la version 2.",
  },
  en: {
    forced_tag_written:
      "PLC write ignored on forced tag press.valve.extend: forced to 1, the PLC wrote 0.",
    step_error: "Error in the simulation step: the step is skipped.",
    diagnostic_raised: "Diagnostic: Conflicting commands.",
    diagnostic_cleared: "Diagnostic cleared: Conflicting commands.",
    fault_set: "Fault injected: Jammed.",
    fault_cleared: "Fault removed: Not responding.",
    migrated: "Document migrated on opening, from version 1 to version 2.",
  },
} as const;

describe("consoleWording", () => {
  for (const language of LANGUAGES) {
    it.each(Object.keys(entries) as ConsoleEntry["code"][])(`${language}: %s`, (code) => {
      const wording = consoleWording(entries[code], createTranslator(language));
      expect(wording.text).toBe(expected[language][code]);
    });
  }

  it("shows the detail of a step error as developer text, apart from the message", () => {
    expect(consoleWording(entries.step_error, createTranslator("fr")).detail).toBe(
      "Cannot read properties of undefined",
    );
    expect(consoleWording(forced, createTranslator("fr")).detail).toBeNull();
  });
});

describe("clockTime", () => {
  it("shows the wall clock in local time, with two digits", () => {
    expect(clockTime(new Date(2026, 9, 1, 7, 5, 9).toISOString())).toBe("07:05:09");
    expect(clockTime(new Date(2026, 9, 1, 23, 59, 0).toISOString())).toBe("23:59:00");
  });
});
