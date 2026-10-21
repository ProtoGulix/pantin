import type {
  IoVariableAssignment,
  SymbolImportPreview,
  SymbolMatch,
  SymbolSummary,
  UnmatchedSignal,
} from "@pantin/protocol";

// Which rows of a symbol import preview the user can act on, and what is checked at the
// start (ADR 0064 point 14). The viewer matches nothing and checks no type: the core's
// preview says which rule matched and how compatible the types are.

/** A signal is named by its module and its tag; a feedback may be in several modules. */
export function symbolRowKey(row: { module: string; tag: string }): string {
  return `${row.module}\u0000${row.tag}`;
}

export interface SymbolImportRows {
  matched: readonly SymbolMatch[];
  toCheck: readonly SymbolMatch[];
  unchanged: readonly SymbolMatch[];
  unmatched: readonly UnmatchedSignal[];
}

/** A sure match: the exact name, a compatible type, nothing the core doubted. */
// Like the CLI without --accept-warnings: the rule (exact, close name, end of the name) is
// shown in words but does not make a row doubtful; a warning or a bad type does (ADR 0064).
function isSureMatch(match: SymbolMatch): boolean {
  return match.compatibility === "compatible" && match.warnings.length === 0;
}

/** An incompatible type is shown but never applied (the core refuses it again). */
export function isApplicable(match: SymbolMatch): boolean {
  return match.compatibility !== "incompatible";
}

export function symbolImportRows(preview: SymbolImportPreview): SymbolImportRows {
  return {
    matched: preview.proposals.filter(isSureMatch),
    toCheck: preview.proposals.filter((match) => !isSureMatch(match)),
    unchanged: preview.unchanged,
    unmatched: preview.unmatchedSignals,
  };
}

/** Sure matches start checked; what is to check starts unchecked, like `--accept-warnings` off. */
export function defaultCheckedKeys(preview: SymbolImportPreview): ReadonlySet<string> {
  return new Set(preview.proposals.filter(isSureMatch).map(symbolRowKey));
}

/**
 * The variables an unmatched signal can take: the ones the core found ambiguous, then the
 * ones no signal took. The core checks the type again when it applies.
 */
export function pickOptions(
  preview: SymbolImportPreview,
  signal: UnmatchedSignal,
): readonly SymbolSummary[] {
  const free = preview.unusedSymbols
    .filter((unused) => unused.reason === "no_signal")
    .map((unused) => unused.symbol);
  const seen = new Set<string>();
  return [...signal.candidates, ...free].filter((symbol) => {
    if (seen.has(symbol.reference)) {
      return false;
    }
    seen.add(symbol.reference);
    return true;
  });
}

/** Exactly the checked rows and the picker choices, nothing else. */
export function buildAssignments(
  preview: SymbolImportPreview,
  checked: ReadonlySet<string>,
  picks: ReadonlyMap<string, string>,
): IoVariableAssignment[] {
  const fromRows = preview.proposals
    .filter((match) => isApplicable(match) && checked.has(symbolRowKey(match)))
    .map(({ module, tag, proposedVariable }) => ({ module, tag, variable: proposedVariable }));
  const fromPickers = preview.unmatchedSignals.flatMap((signal) => {
    const reference = picks.get(symbolRowKey(signal));
    const allowed = pickOptions(preview, signal).some((symbol) => symbol.reference === reference);
    return reference !== undefined && allowed
      ? [{ module: signal.module, tag: signal.tag, variable: reference }]
      : [];
  });
  return [...fromRows, ...fromPickers];
}
