import { describe, expect, it } from "vitest";
import {
  chooseLanguage,
  createTranslator,
  LANGUAGES,
  LOCALE_CATALOGS,
  placeholdersOf,
  pluralKey,
} from "./translate.ts";

const reference = LOCALE_CATALOGS.fr;

describe("locale files", () => {
  it.each(LANGUAGES)("%s has exactly the keys of fr.json", (language) => {
    expect(Object.keys(LOCALE_CATALOGS[language]).sort()).toEqual(Object.keys(reference).sort());
  });

  it.each(LANGUAGES)("%s uses the same placeholders as fr.json in every text", (language) => {
    const catalog: Readonly<Record<string, string>> = LOCALE_CATALOGS[language];
    for (const [key, text] of Object.entries(reference)) {
      expect({ key, placeholders: placeholdersOf(catalog[key] ?? "") }).toEqual({
        key,
        placeholders: placeholdersOf(text),
      });
    }
  });

  it.each(LANGUAGES)("%s has no empty text", (language) => {
    for (const text of Object.values(LOCALE_CATALOGS[language])) {
      expect(text.trim()).not.toBe("");
    }
  });
});

describe("createTranslator", () => {
  it("fills placeholders", () => {
    expect(createTranslator("en")("message.saved", { name: "Press" })).toBe(
      'Pantin "Press" saved.',
    );
    expect(createTranslator("fr")("tree.bodyCount.other", { count: 3 })).toBe("3 corps");
  });

  it("leaves a missing parameter visible", () => {
    expect(createTranslator("en")("message.saved")).toBe('Pantin "{name}" saved.');
  });
});

describe("chooseLanguage", () => {
  it("defaults to French", () => {
    expect(chooseLanguage([], null)).toBe("fr");
    expect(chooseLanguage(["de-DE", "ja"], null)).toBe("fr");
  });

  it("takes the first browser language with a file, region ignored", () => {
    expect(chooseLanguage(["de", "en-GB", "fr"], null)).toBe("en");
    expect(chooseLanguage(["fr-CA"], null)).toBe("fr");
  });

  it("lets the stored choice win, and ignores a corrupt one", () => {
    expect(chooseLanguage(["fr"], "en")).toBe("en");
    expect(chooseLanguage(["en"], "klingon")).toBe("en");
  });
});

describe("pluralKey", () => {
  it("picks one or other", () => {
    expect(pluralKey("tree.bodyCount", 1)).toBe("tree.bodyCount.one");
    expect(pluralKey("tree.bodyCount", 0)).toBe("tree.bodyCount.other");
    expect(pluralKey("tree.bodyCount", 2)).toBe("tree.bodyCount.other");
  });
});
