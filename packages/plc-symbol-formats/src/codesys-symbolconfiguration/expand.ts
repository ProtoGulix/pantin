import { MAX_SYMBOLS, type PlcSymbol, type PlcSymbolAccess } from "../model.ts";
import { attributeOf, childrenNamed, type XmlElement } from "../xml-tree.ts";
import { commentOf, type SymbolType } from "./type-list.ts";

// The node tree of a symbol configuration, walked into the neutral symbols
// (ADR 0064 point 10). A node without a type is a container of the tree
// (Application, a GVL, a program); a typed node is a variable. Structures and
// function blocks are opened into one symbol per member, down to 8 levels.

/** How many structures or function blocks are opened one inside the other. */
const MAX_EXPANSION_DEPTH = 8;

// Every variable visited counts, symbol or not: a type of empty containers that each
// hold ten members of the next one emits nothing yet fans out 10^k calls.
const MAX_WORK = 10 * MAX_SYMBOLS;

/** Raised when the file lists, or would expand into, more than Pantin reads. */
export class TooManySymbolsError extends Error {}

export interface WalkState {
  types: ReadonlyMap<string, SymbolType>;
  symbols: PlcSymbol[];
  // A set, so that a doubtful spelling used a thousand times is said once.
  warnings: Set<string>;
  // Variables visited so far, against MAX_WORK.
  visited: number;
}

interface VariableFacts {
  path: string[];
  typeName: string;
  access: PlcSymbolAccess;
  comment: string | null;
  directAddress: string | undefined;
}

// Only the spellings a real file has shown are mapped; any other becomes
// "unknown" with a warning (ADR 0064 amendment of 2026-10-21). An absent
// attribute is unknown too, without a warning: nothing was spelled.
function accessOf(text: string | undefined, state: WalkState): PlcSymbolAccess {
  if (text === "ReadWrite") {
    return "read_write";
  }
  if (text === "Read") {
    return "read";
  }
  if (text !== undefined) {
    state.warnings.add(
      `The access "${text}" is not known: only Read and ReadWrite have been seen in a real file, so it is read as unknown.`,
    );
  }
  return "unknown";
}

// A read-only structure keeps its members read-only; otherwise a member says its own.
function combinedAccess(parent: PlcSymbolAccess, member: PlcSymbolAccess): PlcSymbolAccess {
  if (parent === "read" || member === "read") {
    return "read";
  }
  return member === "unknown" ? parent : member;
}

function addSymbol(state: WalkState, facts: VariableFacts, iecType: string, aliasOf?: string) {
  if (state.symbols.length >= MAX_SYMBOLS) {
    throw new TooManySymbolsError();
  }
  state.symbols.push({
    path: facts.path,
    iecType,
    access: facts.access,
    comment: facts.comment,
    ...(aliasOf === undefined ? {} : { aliasOf }),
    ...(facts.directAddress === undefined ? {} : { directAddress: facts.directAddress }),
  });
}

function addContainerMembers(
  state: WalkState,
  facts: VariableFacts,
  type: Extract<SymbolType, { kind: "container" }>,
  depth: number,
): void {
  if (depth >= MAX_EXPANSION_DEPTH) {
    state.warnings.add(
      `${facts.path.join(".")} (${type.iecType}) is nested more than ${MAX_EXPANSION_DEPTH} levels deep: it is listed as one symbol, its members are not read.`,
    );
    addSymbol(state, facts, type.iecType);
    return;
  }
  for (const member of type.members) {
    addVariable(
      state,
      {
        path: [...facts.path, member.iecName],
        typeName: member.typeName,
        access: combinedAccess(facts.access, accessOf(member.accessText, state)),
        comment: member.comment,
        directAddress: undefined,
      },
      depth + 1,
    );
  }
}

function addVariable(state: WalkState, facts: VariableFacts, depth: number): void {
  state.visited += 1;
  if (state.visited > MAX_WORK) {
    throw new TooManySymbolsError();
  }
  const type = state.types.get(facts.typeName);
  if (type === undefined) {
    state.warnings.add(
      `${facts.path.join(".")} has the type "${facts.typeName}", which the type list does not define: it is listed with that name.`,
    );
    addSymbol(state, facts, facts.typeName);
  } else if (type.kind === "container") {
    addContainerMembers(state, facts, type, depth);
  } else {
    addSymbol(state, facts, type.iecType, type.aliasOf);
  }
}

/** Walks the Node children of `parent`, appending the symbols to the state. */
export function walkNodes(state: WalkState, parent: XmlElement, path: readonly string[]): void {
  for (const node of childrenNamed(parent, "Node")) {
    const name = attributeOf(node, "name");
    if (name === undefined || name === "") {
      state.warnings.add("A node without a name was skipped.");
      continue;
    }
    const nodePath = [...path, name];
    const typeName = attributeOf(node, "type");
    if (typeName !== undefined) {
      addVariable(
        state,
        {
          path: nodePath,
          typeName,
          access: accessOf(attributeOf(node, "access"), state),
          comment: commentOf(node),
          directAddress: attributeOf(node, "directaddress"),
        },
        0,
      );
    }
    walkNodes(state, node, nodePath);
  }
}
