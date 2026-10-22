import type { SymbolImportPreview, SymbolMatch, SymbolSummary } from "@pantin/protocol";

// A small preview for the tests of the symbol import: two sure matches, one match to check
// (suffix rule with a warning), one match with an incompatible type, one unchanged entry,
// one unmatched signal with a free symbol to pick, and one unusable symbol.

function symbolOf(reference: string, iecType = "BOOL"): SymbolSummary {
  return {
    reference,
    path: reference.split("."),
    iecType,
    access: "read_write",
    comment: null,
  };
}

function matchOf(
  tag: string,
  proposedVariable: string,
  overrides: Partial<SymbolMatch> = {},
): SymbolMatch {
  return {
    module: "m1",
    tag,
    currentVariable: "",
    proposedVariable,
    symbol: symbolOf(proposedVariable),
    rule: "exact",
    compatibility: "compatible",
    warnings: [],
    ...overrides,
  };
}

export const SURE_ONE = matchOf("main.valve.extend", "GVL.valve_extend");
// Found by the end of its name, yet sure: only a warning or a bad type leaves a row to check.
export const SURE_TWO = matchOf("main.valve.retract", "GVL.valve_retract", { rule: "suffix" });
export const TO_CHECK = matchOf("main.rod.position", "GVL.rod_position", {
  rule: "suffix",
  compatibility: "warning",
  warnings: ["The variable is an INT and the channel a REAL."],
});
export const INCOMPATIBLE = matchOf("main.rod.speed", "GVL.rod_speed", {
  rule: "normalised",
  compatibility: "incompatible",
});

export const SYMBOL_PREVIEW: SymbolImportPreview = {
  format: "codesys-symbol-configuration",
  project: { name: "Press", deviceName: "PLC", applicationName: "Application" },
  symbolCount: 7,
  warnings: [],
  proposals: [SURE_ONE, SURE_TWO, TO_CHECK, INCOMPATIBLE],
  unchanged: [
    matchOf("main.valve.state", "GVL.valve_state", { currentVariable: "GVL.valve_state" }),
  ],
  unmatchedSignals: [
    {
      module: "m1",
      tag: "main.rod.home",
      currentVariable: "",
      candidates: [],
    },
  ],
  unusedSymbols: [
    { symbol: symbolOf("GVL.spare_input"), reason: "no_signal" },
    { symbol: symbolOf("GVL.@odd"), reason: "invalid_reference" },
  ],
  moduleProposals: [],
};
