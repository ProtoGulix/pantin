import type { PlcSymbol } from "@pantin/plc-symbol-formats/model";
import type { IoChannel, IoModule, SymbolMatchRule, TagDirection, TagType } from "@pantin/protocol";
import { deriveVariable } from "./io-identifiers.ts";

// Matching PLC symbols to mapped signals (ADR 0064 point 12): pure. Candidates are
// the signals that have a channel, since an import names PLC variables of mapped
// signals only. A rule matches a signal and a symbol only when the pair is unique
// on both sides; the rules run in order and a symbol matched by one is out of the next.

/** A mapped signal: a tag with every channel that carries it, in every module. */
export interface MappedSignal {
  tag: string;
  type: TagType;
  direction: TagDirection;
  channels: { module: IoModule; channel: IoChannel }[];
}

/** A symbol with its reference: its path without the application segment. */
export interface ReferencedSymbol {
  symbol: PlcSymbol;
  segments: string[];
  reference: string;
}

export interface SignalMatch {
  signal: MappedSignal;
  symbol: ReferencedSymbol;
  rule: SymbolMatchRule;
}

export interface MatchingResult {
  matches: SignalMatch[];
  // For a signal left unmatched: the symbols that fitted it ambiguously, by tag.
  ambiguous: ReadonlyMap<string, readonly ReferencedSymbol[]>;
}

const MAX_AMBIGUOUS_CANDIDATES = 10;

export function referencedSymbol(symbol: PlcSymbol): ReferencedSymbol {
  const segments = symbol.path.slice(1);
  return { symbol, segments, reference: segments.join(".") };
}

const lower = (text: string): string => text.toLowerCase();
// Case and underscores are style in a PLC name: "Verin1_Coil_12" and "verin1coil12" are one.
const normalised = (text: string): string => lower(text).replaceAll("_", "");
const lastOf = (segments: readonly string[]): string => segments.at(-1) ?? "";

// "GVL.speed" is the tail of "Application.GVL.speed"; a one-part variable is the last segment.
function variableIsTailOf(variable: string, symbol: ReferencedSymbol): boolean {
  const parts = variable.split(".").map(lower);
  const tail = symbol.segments.slice(-parts.length).map(lower);
  return tail.length === parts.length && tail.every((part, index) => part === parts[index]);
}

interface MatchRuleDefinition {
  rule: SymbolMatchRule;
  symbolKeys(symbol: ReferencedSymbol): string[];
  signalKeys(signal: MappedSignal): string[];
  // The key is a shortcut to find candidates; this is the real test.
  confirms(signal: MappedSignal, symbol: ReferencedSymbol): boolean;
}

// "<assembly>.<tag key>.<member>": the tag key and the member, without the assembly.
function keyAndMember(tag: string): string {
  return tag.split(".").slice(1).join(".");
}

// The last segment ends with "<tag key><member>", at a boundary: every trailing run of its
// "_"-separated parts is a key (verin1_verin_min_state: verin1verinminstate, verinminstate,
// minstate, state). A CamelCase name has no boundary, so only the whole name is a key.
function trailingRuns(name: string): string[] {
  const parts = name.split("_").filter((part) => part !== "");
  const runs = parts.map((_part, start) => normalised(parts.slice(start).join("")));
  return [...new Set(runs)];
}

const RULES: readonly MatchRuleDefinition[] = [
  {
    rule: "exact",
    symbolKeys: (symbol) => [lower(lastOf(symbol.segments))],
    signalKeys: (signal) =>
      signal.channels.map(({ channel }) => lower(lastOf(channel.variable.split(".")))),
    confirms: (signal, symbol) =>
      signal.channels.some(({ channel }) => variableIsTailOf(channel.variable, symbol)),
  },
  {
    rule: "normalised",
    symbolKeys: (symbol) => [normalised(lastOf(symbol.segments))],
    signalKeys: (signal) => [normalised(deriveVariable(signal.tag))],
    confirms: () => true,
  },
  {
    rule: "suffix",
    symbolKeys: (symbol) => trailingRuns(lastOf(symbol.segments)),
    signalKeys: (signal) => [normalised(deriveVariable(keyAndMember(signal.tag)))],
    confirms: () => true,
  },
];

function pushTo<Key, Item>(map: Map<Key, Item[]>, key: Key, item: Item): void {
  const items = map.get(key);
  if (items === undefined) {
    map.set(key, [item]);
  } else {
    items.push(item);
  }
}

function indexBy(symbols: readonly ReferencedSymbol[], keysOf: (s: ReferencedSymbol) => string[]) {
  const index = new Map<string, ReferencedSymbol[]>();
  for (const symbol of symbols) {
    for (const key of keysOf(symbol)) {
      pushTo(index, key, symbol);
    }
  }
  return index;
}

function candidatesOf(
  definition: MatchRuleDefinition,
  signal: MappedSignal,
  index: ReadonlyMap<string, readonly ReferencedSymbol[]>,
): ReferencedSymbol[] {
  const found = definition
    .signalKeys(signal)
    .flatMap((key) => index.get(key) ?? [])
    .filter((symbol) => definition.confirms(signal, symbol));
  return [...new Set(found)];
}

function claimantsBySymbol(candidates: ReadonlyMap<MappedSignal, readonly ReferencedSymbol[]>) {
  const claimants = new Map<ReferencedSymbol, MappedSignal[]>();
  for (const [signal, symbols] of candidates) {
    for (const symbol of symbols) {
      pushTo(claimants, symbol, signal);
    }
  }
  return claimants;
}

/** Runs the rules in order; a signal and a symbol match when each is the other's only candidate. */
export function matchSignals(
  signals: readonly MappedSignal[],
  symbols: readonly ReferencedSymbol[],
): MatchingResult {
  const matches: SignalMatch[] = [];
  const ambiguous = new Map<string, readonly ReferencedSymbol[]>();
  let remainingSignals = [...signals];
  let remainingSymbols = [...symbols];
  for (const definition of RULES) {
    const index = indexBy(remainingSymbols, definition.symbolKeys);
    const candidates = new Map(
      remainingSignals.map((signal) => [signal, candidatesOf(definition, signal, index)]),
    );
    const claimants = claimantsBySymbol(candidates);
    const matchedSignals = new Set<MappedSignal>();
    const matchedSymbols = new Set<ReferencedSymbol>();
    for (const [signal, found] of candidates) {
      const [only] = found;
      if (found.length === 1 && only !== undefined && claimants.get(only)?.length === 1) {
        matches.push({ signal, symbol: only, rule: definition.rule });
        matchedSignals.add(signal);
        matchedSymbols.add(only);
      } else if (found.length > 0 && !ambiguous.has(signal.tag)) {
        ambiguous.set(signal.tag, found.slice(0, MAX_AMBIGUOUS_CANDIDATES));
      }
    }
    remainingSignals = remainingSignals.filter((signal) => !matchedSignals.has(signal));
    remainingSymbols = remainingSymbols.filter((symbol) => !matchedSymbols.has(symbol));
  }
  // A signal matched by a later rule is no longer ambiguous.
  for (const { signal } of matches) {
    ambiguous.delete(signal.tag);
  }
  return { matches, ambiguous };
}

/** True when the channel's current variable already names the symbol (the "unchanged" test). */
export function channelNamesSymbol(channel: IoChannel, symbol: ReferencedSymbol): boolean {
  return variableIsTailOf(channel.variable, symbol);
}
