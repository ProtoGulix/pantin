import { CODESYS_SYMBOLCONFIGURATION_FORMAT } from "./codesys-symbolconfiguration/format.ts";
import type { PlcSymbolFormat } from "./model.ts";

// The registry of the symbol formats (ADR 0064 point 10): one folder each. The
// core asks here and never names a format, so a new format is a folder and one
// line below.

export const PLC_SYMBOL_FORMATS: readonly PlcSymbolFormat[] = [CODESYS_SYMBOLCONFIGURATION_FORMAT];

export const PLC_SYMBOL_FORMAT_IDS: readonly string[] = PLC_SYMBOL_FORMATS.map(
  (format) => format.id,
);

export function findFormatById(id: string): PlcSymbolFormat | undefined {
  return PLC_SYMBOL_FORMATS.find((format) => format.id === id);
}

/** The first format whose detection recognises the text. */
export function detectFormat(text: string): PlcSymbolFormat | undefined {
  return PLC_SYMBOL_FORMATS.find((format) => format.detect(text));
}
