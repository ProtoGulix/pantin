import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { consolePantin } from "../console/console-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import {
  buildExternalEditBanner,
  buildReloadQuestion,
  FOCUS_REREAD_DEBOUNCE_MILLISECONDS,
  reloadNeedsConfirmation,
  shouldRereadOnFocus,
} from "./external-edit-model.ts";

function changed(...files: PantinResponse["changedOutside"]): PantinResponse {
  return { ...consolePantin, changedOutside: files };
}

describe("the banner text", () => {
  it("is hidden with no Pantin or no change", () => {
    const t = createTranslator("fr");
    expect(buildExternalEditBanner(null, t)).toBeNull();
    expect(buildExternalEditBanner(changed(), t)).toBeNull();
  });

  it("names the one file that changed, in French and English", () => {
    expect(buildExternalEditBanner(changed("pantin.json"), createTranslator("fr"))).toEqual({
      text: "pantin.json modifié en dehors de Pantin. Enregistrer l'écrasera.",
      glyphLabel: "Avertissement",
      reloadLabel: "Relire le fichier",
    });
    expect(buildExternalEditBanner(changed("io.json"), createTranslator("en"))).toEqual({
      text: "io.json modified outside Pantin. Saving will overwrite it.",
      glyphLabel: "Warning",
      reloadLabel: "Reload the file",
    });
  });

  it("speaks in the plural when both files changed", () => {
    const both = changed("pantin.json", "io.json");
    expect(buildExternalEditBanner(both, createTranslator("fr"))).toMatchObject({
      text: "pantin.json et io.json modifiés en dehors de Pantin. Enregistrer les écrasera.",
      reloadLabel: "Relire les fichiers",
    });
    expect(buildExternalEditBanner(both, createTranslator("en"))).toMatchObject({
      text: "pantin.json and io.json modified outside Pantin. Saving will overwrite them.",
      reloadLabel: "Reload the files",
    });
  });
});

describe("the reload question", () => {
  const t = createTranslator("en");

  it("is asked only when reloading was requested and a file changed", () => {
    expect(buildReloadQuestion(changed("io.json"), false, t)).toBeNull();
    expect(buildReloadQuestion(changed(), true, t)).toBeNull();
    expect(buildReloadQuestion(changed("io.json"), true, t)).toContain("io.json");
    expect(buildReloadQuestion(changed("pantin.json", "io.json"), true, t)).toContain(
      "Reloading the files",
    );
  });

  it("needs a confirmation only over unsaved changes", () => {
    expect(reloadNeedsConfirmation({ ...consolePantin, unsavedChanges: true })).toBe(true);
    expect(reloadNeedsConfirmation({ ...consolePantin, unsavedChanges: false })).toBe(false);
  });
});

describe("the re-read on focus", () => {
  const ready = { pantinOpen: true, requestInFlight: false, lastRereadAt: null, now: 10_000 };

  it("reads when a Pantin is open, nothing runs and nothing was read lately", () => {
    expect(shouldRereadOnFocus(ready)).toBe(true);
  });

  it("skips with no Pantin or while a request is in flight", () => {
    expect(shouldRereadOnFocus({ ...ready, pantinOpen: false })).toBe(false);
    expect(shouldRereadOnFocus({ ...ready, requestInFlight: true })).toBe(false);
  });

  it("debounces the focus and visibility events that arrive together", () => {
    const lastRereadAt = 10_000 - FOCUS_REREAD_DEBOUNCE_MILLISECONDS + 1;
    expect(shouldRereadOnFocus({ ...ready, lastRereadAt })).toBe(false);
    expect(shouldRereadOnFocus({ ...ready, lastRereadAt: lastRereadAt - 1 })).toBe(true);
  });
});
