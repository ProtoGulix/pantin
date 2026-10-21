import {
  findFormatById,
  PLC_SYMBOL_FORMAT_IDS,
  PLC_SYMBOL_FORMATS,
} from "@pantin/plc-symbol-formats/formats";
import type { PlcSymbolList } from "@pantin/plc-symbol-formats/model";
import type {
  IoDocument,
  SymbolCompatibility,
  SymbolImportPreview,
  SymbolMatch,
  SymbolSummary,
  UnmatchedSignal,
  UnusedSymbol,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { variableProblemOf } from "./io-identifiers.ts";
import { rulesOf } from "./io-transports.ts";
import type { IoTag } from "./io-validation.ts";
import { assessTypeCompatibility, canCarryAnySignal } from "./symbol-compatibility.ts";
import {
  channelNamesSymbol,
  type MappedSignal,
  matchSignals,
  type ReferencedSymbol,
  referencedSymbol,
  type SignalMatch,
} from "./symbol-matching.ts";

// From a PLC symbol file and the open mapping to the preview of an import
// (ADR 0064 point 13): pure, nothing is stored and nothing changes.

function summaryOf({ symbol, reference }: ReferencedSymbol): SymbolSummary {
  return {
    reference,
    path: symbol.path,
    iecType: symbol.iecType,
    access: symbol.access,
    comment: symbol.comment,
    ...(symbol.aliasOf === undefined ? {} : { aliasOf: symbol.aliasOf }),
    ...(symbol.directAddress === undefined ? {} : { directAddress: symbol.directAddress }),
  };
}

/** The signals that have a channel: one per tag, with all its channels. */
function mappedSignalsOf(document: IoDocument, tags: readonly IoTag[]): MappedSignal[] {
  const typeByTag = new Map(tags.map((tag) => [tag.name, tag.type]));
  const byTag = new Map<string, MappedSignal>();
  for (const module of document.modules) {
    for (const channel of module.channels) {
      const type = typeByTag.get(channel.tag);
      if (type === undefined) {
        continue;
      }
      const signal = byTag.get(channel.tag) ?? { tag: channel.tag, type, channels: [] };
      signal.channels.push({ module, channel });
      byTag.set(channel.tag, signal);
    }
  }
  return [...byTag.values()];
}

function worst(first: SymbolCompatibility, second: SymbolCompatibility): SymbolCompatibility {
  const order: SymbolCompatibility[] = ["compatible", "warning", "incompatible"];
  return order[Math.max(order.indexOf(first), order.indexOf(second))] ?? "incompatible";
}

function matchesOfChannels({ signal, symbol, rule }: SignalMatch): SymbolMatch[] {
  const assessment = assessTypeCompatibility(signal.type, symbol.symbol.iecType);
  return signal.channels.map(({ module, channel }) => {
    const transportWarnings =
      assessment.compatibility === "incompatible"
        ? []
        : rulesOf(module.transport).symbolWarnings(channel, symbol.symbol);
    const unchanged = rule === "exact" && channelNamesSymbol(channel, symbol);
    return {
      module: module.key,
      tag: signal.tag,
      currentVariable: channel.variable,
      proposedVariable: unchanged ? channel.variable : symbol.reference,
      symbol: summaryOf(symbol),
      rule,
      compatibility: worst(
        assessment.compatibility,
        transportWarnings.length > 0 ? "warning" : "compatible",
      ),
      warnings: [...assessment.warnings, ...transportWarnings],
    };
  });
}

function unusedReasonOf(symbol: ReferencedSymbol): UnusedSymbol["reason"] {
  if (variableProblemOf(symbol.reference) !== null) {
    return "invalid_reference";
  }
  return canCarryAnySignal(symbol.symbol.iecType) ? "no_signal" : "incompatible_type";
}

function unmatchedOf(
  signals: readonly MappedSignal[],
  matched: ReadonlySet<string>,
  ambiguous: ReadonlyMap<string, readonly ReferencedSymbol[]>,
): UnmatchedSignal[] {
  return signals
    .filter((signal) => !matched.has(signal.tag))
    .flatMap((signal) =>
      signal.channels.map(({ module, channel }) => ({
        module: module.key,
        tag: signal.tag,
        currentVariable: channel.variable,
        candidates: (ambiguous.get(signal.tag) ?? []).map(summaryOf),
      })),
    );
}

interface SymbolPreviewInput {
  formatId: string;
  list: PlcSymbolList;
  document: IoDocument;
  tags: readonly IoTag[];
}

/** The preview of an import: what would change, what stays, and what is left. */
function buildSymbolPreview(input: SymbolPreviewInput): SymbolImportPreview {
  const signals = mappedSignalsOf(input.document, input.tags);
  const symbols = input.list.symbols.map(referencedSymbol);
  const usable = symbols.filter((symbol) => variableProblemOf(symbol.reference) === null);
  const { matches, ambiguous } = matchSignals(signals, usable);
  const channelMatches = matches.flatMap(matchesOfChannels);
  const used = new Set(matches.map((match) => match.symbol));
  return {
    format: input.formatId,
    project: input.list.project,
    symbolCount: symbols.length,
    warnings: input.list.warnings,
    proposals: channelMatches.filter((match) => match.proposedVariable !== match.currentVariable),
    unchanged: channelMatches.filter((match) => match.proposedVariable === match.currentVariable),
    unmatchedSignals: unmatchedOf(signals, new Set(matches.map((m) => m.signal.tag)), ambiguous),
    unusedSymbols: symbols
      .filter((symbol) => !used.has(symbol))
      .map((symbol) => ({ symbol: summaryOf(symbol), reason: unusedReasonOf(symbol) })),
  };
}

function unknownFormat(formatId: string): ApiError {
  return new ApiError(
    "invalid_request",
    `Unknown symbol format "${formatId}". Known formats: ${PLC_SYMBOL_FORMAT_IDS.join(", ")}.`,
  );
}

/**
 * Reads the symbol file with the named format, or the first format that recognises it,
 * and builds the preview. A file that cannot be read is a 400 that says why.
 */
export function previewSymbolImport(
  text: string,
  formatId: string | undefined,
  document: IoDocument,
  tags: readonly IoTag[],
): SymbolImportPreview {
  const format =
    formatId === undefined
      ? PLC_SYMBOL_FORMATS.find((candidate) => candidate.detect(text))
      : findFormatById(formatId);
  if (format === undefined && formatId !== undefined) {
    throw unknownFormat(formatId);
  }
  if (format === undefined) {
    throw new ApiError(
      "invalid_request",
      `No known symbol format recognises this file. Known formats: ${PLC_SYMBOL_FORMAT_IDS.join(", ")}. Pass one explicitly if the file is of that format.`,
    );
  }
  const parsed = format.parse(text);
  if (!parsed.ok) {
    const reasons = parsed.problems.map((problem) => problem.message).join(" ");
    throw new ApiError("invalid_request", `The ${format.id} file cannot be read: ${reasons}`);
  }
  return buildSymbolPreview({ formatId: format.id, list: parsed.list, document, tags });
}
