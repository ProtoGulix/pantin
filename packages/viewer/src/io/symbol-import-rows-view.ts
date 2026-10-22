import type { SymbolMatch, SymbolSummary, UnmatchedSignal, UnusedSymbol } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import { isApplicable, pickOptions, symbolImportRows, symbolRowKey } from "./symbol-import-rows.ts";
import type { SymbolImportState } from "./symbol-import-state.ts";
import { symbolWarningText } from "./symbol-notice-text.ts";

// The rows and sections of the PLC symbol import dialog as plain data (ADR 0064 point 14).
// Every remark is a sentence: the tint of a row is never the only cue.

type SymbolRowTone = "normal" | "warning";

export interface SymbolRowView {
  key: string;
  signal: string;
  // "Label : value" lines: current variable, proposed variable, match kind.
  details: readonly string[];
  // Warnings and remarks, each one a sentence.
  remarks: readonly string[];
  tone: SymbolRowTone;
  // Null: nothing to check (unchanged, unused, or a type that cannot be applied).
  checkbox: { checked: boolean; label: string } | null;
  picker: SymbolPickerView | null;
}

export interface SymbolPickerView {
  label: string;
  emptyOption: string;
  noOptionsText: string;
  options: readonly { value: string; text: string }[];
  selected: string;
}

export interface SymbolSectionView {
  id: "matched" | "toCheck" | "unchanged" | "unmatched" | "unused";
  heading: string;
  emptyText: string;
  rows: readonly SymbolRowView[];
}

const RULE_KEYS = {
  exact: "symbols.rule.exact",
  normalised: "symbols.rule.normalised",
  suffix: "symbols.rule.suffix",
} as const satisfies Record<SymbolMatch["rule"], MessageKey>;

const UNUSED_KEYS = {
  no_signal: "symbols.unused.no_signal",
  incompatible_type: "symbols.unused.incompatible_type",
  invalid_reference: "symbols.unused.invalid_reference",
} as const satisfies Record<UnusedSymbol["reason"], MessageKey>;

function variableText(variable: string, translate: Translate): string {
  return variable === "" ? translate("symbols.row.empty") : variable;
}

function matchRow(
  match: SymbolMatch,
  checked: ReadonlySet<string>,
  translate: Translate,
  showProposal: boolean,
): SymbolRowView {
  const key = symbolRowKey(match);
  const current = variableText(match.currentVariable, translate);
  const remarks = match.warnings.map((warning) => symbolWarningText(warning, translate));
  if (match.compatibility === "warning" && match.warnings.length === 0) {
    remarks.push(translate("symbols.compat.warning"));
  }
  if (match.compatibility === "incompatible") {
    remarks.push(translate("symbols.compat.incompatible"));
  }
  const details = showProposal
    ? [
        translate("symbols.row.current", { value: current }),
        translate("symbols.row.proposed", { value: match.proposedVariable }),
        translate("symbols.row.rule", { value: translate(RULE_KEYS[match.rule]) }),
      ]
    : [translate("symbols.row.variable", { value: current })];
  return {
    key,
    signal: `${match.module} / ${match.tag}`,
    details,
    remarks,
    tone: remarks.length > 0 ? "warning" : "normal",
    checkbox:
      showProposal && isApplicable(match)
        ? {
            checked: checked.has(key),
            label: translate("symbols.row.check", {
              signal: `${match.module} / ${match.tag}`,
              variable: match.proposedVariable,
            }),
          }
        : null,
    picker: null,
  };
}

function symbolText(symbol: SymbolSummary, translate: Translate): string {
  return translate("symbols.pick.option", { reference: symbol.reference, type: symbol.iecType });
}

function unmatchedRow(
  signal: UnmatchedSignal,
  options: readonly SymbolSummary[],
  selected: string,
  translate: Translate,
): SymbolRowView {
  const name = `${signal.module} / ${signal.tag}`;
  return {
    key: symbolRowKey(signal),
    signal: name,
    details: [
      translate("symbols.row.variable", { value: variableText(signal.currentVariable, translate) }),
    ],
    remarks: [
      translate(
        signal.candidates.length > 0 ? "symbols.unmatched.ambiguous" : "symbols.unmatched.none",
      ),
    ],
    tone: "normal",
    checkbox: null,
    picker: {
      label: translate("symbols.pick.label", { signal: name }),
      emptyOption: translate("symbols.pick.none"),
      noOptionsText: translate("symbols.pick.noOptions"),
      options: options.map((symbol) => ({
        value: symbol.reference,
        text: symbolText(symbol, translate),
      })),
      selected,
    },
  };
}

function unusedRow(unused: UnusedSymbol, translate: Translate): SymbolRowView {
  const { symbol } = unused;
  return {
    key: symbol.reference,
    signal: symbol.reference,
    details: [translate("symbols.row.type", { value: symbol.iecType })],
    remarks: [translate(UNUSED_KEYS[unused.reason])],
    tone: "normal",
    checkbox: null,
    picker: null,
  };
}

function section(
  id: SymbolSectionView["id"],
  rows: readonly SymbolRowView[],
  translate: Translate,
): SymbolSectionView {
  return {
    id,
    heading: translate("symbols.section", {
      title: translate(`symbols.section.${id}`),
      count: rows.length,
    }),
    emptyText: translate("symbols.section.empty"),
    rows,
  };
}

export function readySections(
  state: Extract<SymbolImportState, { status: "ready" }>,
  translate: Translate,
): SymbolSectionView[] {
  const { preview, checked, picks } = state;
  const rows = symbolImportRows(preview);
  const matchRows = (matches: readonly SymbolMatch[], showProposal: boolean) =>
    matches.map((match) => matchRow(match, checked, translate, showProposal));
  return [
    section("matched", matchRows(rows.matched, true), translate),
    section("toCheck", matchRows(rows.toCheck, true), translate),
    section("unchanged", matchRows(rows.unchanged, false), translate),
    section(
      "unmatched",
      rows.unmatched.map((signal) =>
        unmatchedRow(
          signal,
          pickOptions(preview, signal),
          picks.get(symbolRowKey(signal)) ?? "",
          translate,
        ),
      ),
      translate,
    ),
    section(
      "unused",
      preview.unusedSymbols.map((unused) => unusedRow(unused, translate)),
      translate,
    ),
  ];
}
