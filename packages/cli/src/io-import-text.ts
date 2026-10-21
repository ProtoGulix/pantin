import type { SymbolImportPreview, SymbolMatch, SymbolSummary } from "@pantin/protocol";

// The text of `pantin io import-symbols`: the preview as sections with their counts, in
// words only (colour is never the only cue). Pure.

// Each section lists at most this many rows; the count in its heading says the rest.
const ROW_LIMIT = 50;

const symbolText = (symbol: SymbolSummary): string => `${symbol.reference} (${symbol.iecType})`;

function rows(heading: string, items: readonly string[]): string[] {
  const shown = items.slice(0, ROW_LIMIT).map((item) => `  ${item}`);
  const hidden = items.length - shown.length;
  return [
    `${heading}: ${items.length}`,
    ...shown,
    ...(hidden > 0 ? [`  ... and ${hidden} more`] : []),
  ];
}

function matchRow(match: SymbolMatch): string {
  const change =
    match.proposedVariable === match.currentVariable
      ? match.currentVariable
      : `${match.currentVariable} -> ${match.proposedVariable}`;
  const notes = match.warnings.map((warning) => `\n      warning: ${warning}`).join("");
  return `[${match.module}] ${match.tag}: ${change} (${match.rule}, ${match.compatibility})${notes}`;
}

function byCompatibility(proposals: readonly SymbolMatch[], wanted: SymbolMatch["compatibility"]) {
  return proposals.filter((match) => match.compatibility === wanted).map(matchRow);
}

export function renderSymbolPreview(preview: SymbolImportPreview): string {
  const project = preview.project;
  const where = project === null ? "" : `, project "${project.name}" (${project.applicationName})`;
  const lines = [
    `Format ${preview.format}${where}: ${preview.symbolCount} symbols read.`,
    ...preview.warnings.map((warning) => `note: ${warning}`),
    ...rows("Matched", byCompatibility(preview.proposals, "compatible")),
    ...rows("To check (warnings)", byCompatibility(preview.proposals, "warning")),
    ...rows("Incompatible (never applied)", byCompatibility(preview.proposals, "incompatible")),
    ...rows("Unchanged", preview.unchanged.map(matchRow)),
    ...rows(
      "Unmatched signals",
      preview.unmatchedSignals.map((signal) => {
        const candidates = signal.candidates.map(symbolText).join(", ");
        const suffix = candidates === "" ? "" : ` - candidates: ${candidates}`;
        return `[${signal.module}] ${signal.tag}: ${signal.currentVariable}${suffix}`;
      }),
    ),
    ...rows(
      "Unused symbols",
      preview.unusedSymbols.map((entry) => `${symbolText(entry.symbol)} - ${entry.reason}`),
    ),
  ];
  return lines.join("\n");
}
