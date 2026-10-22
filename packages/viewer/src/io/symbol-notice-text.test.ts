import {
  SKIP_REASON_CODES,
  type SkipReason,
  SYMBOL_WARNING_CODES,
  type SymbolWarning,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator, LANGUAGES, LOCALE_CATALOGS } from "../i18n/translate.ts";
import { skipReasonText, symbolWarningText } from "./symbol-notice-text.ts";

const french = createTranslator("fr");
const english = createTranslator("en");

describe("symbol notice labels", () => {
  it.each(LANGUAGES)("%s labels every warning code and refusal reason", (language) => {
    const catalog: Readonly<Record<string, string>> = LOCALE_CATALOGS[language];
    const keys = [
      ...SYMBOL_WARNING_CODES.map((code) => `symbols.warning.${code}`),
      ...SKIP_REASON_CODES.map((code) => `symbols.reason.${code}`),
    ];
    expect(keys.filter((key) => catalog[key] === undefined)).toEqual([]);
  });
});

describe("symbolWarningText", () => {
  const typeDiffers: SymbolWarning = {
    code: "opcua_type_differs",
    values: { channelType: "REAL", variableType: "INT" },
    message: "english",
  };

  it("interpolates the values in each language", () => {
    expect(symbolWarningText(typeDiffers, french)).toBe(
      "La voie OPC UA est de type REAL, mais la variable de l'automate est de type INT : changez le type de la variable de l'automate en REAL.",
    );
    expect(symbolWarningText(typeDiffers, english)).toContain(
      "change the type of the PLC variable to REAL",
    );
  });

  it("says the access in words", () => {
    const warning: SymbolWarning = {
      code: "opcua_command_not_readable",
      values: { access: "write" },
      message: "english",
    };
    expect(symbolWarningText(warning, french)).toContain("en écriture seule");
    expect(symbolWarningText(warning, english)).toContain("is write-only");
  });

  it("shows an unknown access as the file wrote it", () => {
    const warning: SymbolWarning = {
      code: "access_unknown",
      values: { access: "write" },
      message: "english",
    };
    expect(symbolWarningText(warning, english)).toContain('The access "write" is not known');
  });

  it("falls back to the core message for a code without label", () => {
    // Cast: simulates a core newer than this viewer.
    const unknown = {
      code: "brand_new",
      values: {},
      message: "From the core.",
    } as unknown as SymbolWarning;
    expect(symbolWarningText(unknown, french)).toBe("From the core.");
  });
});

describe("skipReasonText", () => {
  const tooLong = (reference: string): SkipReason => ({
    code: "variable_too_long",
    values: { variable: "Part", reference, max: "255" },
    message: "english",
  });

  it("names the whole reference when the variable is one part of it", () => {
    expect(skipReasonText(tooLong("Main.Part"), english)).toBe(
      'Variable "Part" is longer than 255 characters. (a part of "Main.Part")',
    );
    expect(skipReasonText(tooLong("Part"), french)).toBe(
      "La variable « Part » dépasse 255 caractères.",
    );
  });
});
