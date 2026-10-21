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
  file_changed_outside: entryOf(31, {
    code: "file_changed_outside",
    level: "warning",
    source: { kind: "pantin" },
    params: { file: "io.json" },
  }),
  migrated: entryOf(7, {
    code: "migrated",
    level: "info",
    source: { kind: "pantin" },
    params: { from: 1, to: 2 },
  }),
  clock_paused: entryOf(8, {
    code: "clock_paused",
    level: "info",
    source: { kind: "pantin" },
    params: {},
  }),
  clock_resumed: entryOf(9, {
    code: "clock_resumed",
    level: "info",
    source: { kind: "pantin" },
    params: {},
  }),
  face_file_missing: entryOf(10, {
    code: "face_file_missing",
    level: "warning",
    source: { kind: "body", id: "rail" },
    params: {},
  }),
  emitter_blocked: entryOf(11, {
    code: "emitter_blocked",
    level: "warning",
    source: { kind: "pantin" },
    params: { emitter: "source" },
  }),
  product_limit: entryOf(12, {
    code: "product_limit",
    level: "warning",
    source: { kind: "pantin" },
    params: { emitter: "source" },
  }),
  physics_rebuilt: entryOf(13, {
    code: "physics_rebuilt",
    level: "info",
    source: { kind: "pantin" },
    params: { products: 3 },
  }),
  plc_connected: entryOf(14, {
    code: "plc_connected",
    level: "info",
    source: { kind: "pantin" },
    params: { module: "m1" },
  }),
  plc_disconnected: entryOf(15, {
    code: "plc_disconnected",
    level: "warning",
    source: { kind: "pantin" },
    params: { module: "m1", reason: "timeout" },
  }),
  bridge_connected: entryOf(16, {
    code: "bridge_connected",
    level: "info",
    source: { kind: "pantin" },
    params: {},
  }),
  bridge_disconnected: entryOf(17, {
    code: "bridge_disconnected",
    level: "warning",
    source: { kind: "pantin" },
    params: { reason: "closed" },
  }),
  clock_paused_with_bridge: entryOf(18, {
    code: "clock_paused_with_bridge",
    level: "warning",
    source: { kind: "pantin" },
    params: {},
  }),
  bridge_failed: entryOf(19, {
    code: "bridge_failed",
    level: "error",
    source: { kind: "pantin" },
    params: { kind: "mapping_changed", message: "The I/O mapping changed." },
  }),
  bridge_log: entryOf(20, {
    code: "bridge_log",
    level: "warning",
    source: { kind: "pantin" },
    params: { message: "WARNING refused request: function 3, address 40000" },
  }),
  sensor_changed: entryOf(21, {
    code: "sensor_changed",
    level: "trace",
    source: { kind: "sensor", id: "e1" },
    params: { tag: "press.e1.extended", value: 1 },
  }),
  trace_dropped: entryOf(22, {
    code: "trace_dropped",
    level: "info",
    source: { kind: "pantin" },
    params: { dropped: 40 },
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
    file_changed_outside: "io.json modifié en dehors de Pantin. Enregistrer l'écrasera.",
    migrated: "Document migré à l'ouverture, de la version 1 à la version 2.",
    clock_paused: "Simulation en pause.",
    clock_resumed: "Simulation reprise.",
    face_file_missing:
      "Pas de fichier de faces : sur ce corps, l'alignement ne pourra viser que le plan d'un triangle, aucun axe.",
    emitter_blocked: "Émetteur source : aucun produit créé, l'emplacement est occupé.",
    product_limit: "Émetteur source : aucun produit créé, la limite de produits est atteinte.",
    physics_rebuilt: "Convoyeurs ou guides modifiés : les 3 produit(s) ont été retirés.",
    plc_connected: "Automate connecté au module m1.",
    plc_disconnected:
      "Automate déconnecté du module m1 (plus de réponse dans le délai) : ses commandes booléennes sont remises à 0.",
    bridge_connected: "Pont automate connecté.",
    bridge_disconnected:
      "Pont automate déconnecté (connexion fermée) : les commandes booléennes mappées sont remises à 0.",
    clock_paused_with_bridge:
      "Simulation en pause alors qu'un pont automate est connecté : l'automate voit une machine figée.",
    bridge_failed: "Le pont automate s'est arrêté sur une erreur (détail ci-dessous).",
    bridge_log: "Pont automate : WARNING refused request: function 3, address 40000",
    sensor_changed: "Le tag press.e1.extended passe à 1.",
    trace_dropped:
      "Mode détaillé : 40 ligne(s) de trace omise(s), trop de changements de capteurs en peu de pas.",
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
    file_changed_outside: "io.json modified outside Pantin. Saving will overwrite it.",
    clock_paused: "Simulation paused.",
    clock_resumed: "Simulation resumed.",
    face_file_missing:
      "No face file: on this body, alignment can only pick the plane of a triangle, no axis.",
    emitter_blocked: "Emitter source: no product created, the spot is occupied.",
    product_limit: "Emitter source: no product created, the limit of products is reached.",
    physics_rebuilt: "Belts or guides changed: the 3 product(s) were removed.",
    plc_connected: "PLC connected to module m1.",
    plc_disconnected:
      "PLC disconnected from module m1 (no answer in time): its bit commands are reset to 0.",
    bridge_connected: "PLC bridge connected.",
    bridge_disconnected:
      "PLC bridge disconnected (connection closed): the mapped bit commands are reset to 0.",
    clock_paused_with_bridge:
      "Simulation paused while a PLC bridge is connected: the PLC sees a frozen machine.",
    bridge_failed: "The PLC bridge stopped on an error (detail below).",
    bridge_log: "PLC bridge: WARNING refused request: function 3, address 40000",
    sensor_changed: "Tag press.e1.extended changes to 1.",
    trace_dropped:
      "Verbose mode: 40 trace line(s) left out, too many sensor changes in a few steps.",
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

describe("the migration to version 13", () => {
  const followers = entryOf(30, {
    code: "migrated",
    level: "info",
    source: { kind: "pantin" },
    params: { from: 12, to: 13, followers: "x-free, y-free" },
  });

  it("lists the bodies that now follow their group, as the detail of the line", () => {
    expect(consoleWording(followers, createTranslator("en")).detail).toBe(
      "Bodies with no parent joint now follow their group when it moves: x-free, y-free.",
    );
    expect(consoleWording(followers, createTranslator("fr")).detail).toContain("x-free, y-free");
    expect(consoleWording(entries.migrated, createTranslator("en")).detail).toBeNull();
  });
});

describe("clockTime", () => {
  it("shows the wall clock in local time, with two digits", () => {
    expect(clockTime(new Date(2026, 9, 1, 7, 5, 9).toISOString())).toBe("07:05:09");
    expect(clockTime(new Date(2026, 9, 1, 23, 59, 0).toISOString())).toBe("23:59:00");
  });
});
