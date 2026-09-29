import en from "./locales/en.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };

// Translation files per ADR 0010. fr.json is the reference: its keys type
// every lookup, so a missing or misspelled key is a compile error, and the
// catalog table below refuses a language file that lacks a key.

export type MessageKey = keyof typeof fr;
export type MessageParameters = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, parameters?: MessageParameters) => string;

export const LANGUAGES = ["fr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

const DEFAULT_LANGUAGE: Language = "fr";

export const LOCALE_CATALOGS: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = {
  fr,
  en,
};

const PLACEHOLDER = /\{(\w+)\}/g;

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** Names of the {placeholders} of a text, sorted, for comparisons between languages. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? "").sort();
}

export function createTranslator(language: Language): Translate {
  const catalog = LOCALE_CATALOGS[language];
  return (key, parameters = {}) =>
    catalog[key].replace(PLACEHOLDER, (whole, name: string) => {
      const value = parameters[name];
      // A missing parameter stays visible rather than silently disappearing.
      return value === undefined ? whole : String(value);
    });
}

/**
 * The stored choice wins; otherwise the first browser language we have a file
 * for ("fr-CA" counts as "fr"); otherwise French.
 */
export function chooseLanguage(preferred: readonly string[], stored: string | null): Language {
  if (isLanguage(stored)) {
    return stored;
  }
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split("-")[0];
    if (isLanguage(primary)) {
      return primary;
    }
  }
  return DEFAULT_LANGUAGE;
}

/** Plural forms are separate keys (ADR 0010): ".one" for 1, ".other" otherwise. */
export function pluralKey<Base extends string>(
  base: Base,
  count: number,
): `${Base}.one` | `${Base}.other` {
  return count === 1 ? `${base}.one` : `${base}.other`;
}
