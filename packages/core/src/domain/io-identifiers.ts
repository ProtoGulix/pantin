import { createHash } from "node:crypto";

// The CODESYS variable name rules of ADR 0045 point 9. NOT VERIFIED: they are
// IEC 61131-3 as commonly summarised, nobody read the standard or the CODESYS
// documentation for them.

export const VARIABLE_MAX_LENGTH = 64;
const CUT_LENGTH = 56;
const HASH_CHARACTERS = 7;

// No leading, trailing or double underscore.
const VARIABLE_PATTERN = /^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/;

// IEC 61131-3 keywords and elementary type names, plus a few CODESYS
// additions (ADR 0045 point 9: a list in core). NOT VERIFIED as complete: a
// name missing here is accepted by Pantin and may be refused by CODESYS. IEC
// identifiers are case-insensitive, so the comparison is on upper case.
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  // Elementary types.
  "BOOL",
  "BYTE",
  "WORD",
  "DWORD",
  "LWORD",
  "SINT",
  "INT",
  "DINT",
  "LINT",
  "USINT",
  "UINT",
  "UDINT",
  "ULINT",
  "REAL",
  "LREAL",
  "TIME",
  "LTIME",
  "DATE",
  "LDATE",
  "TIME_OF_DAY",
  "TOD",
  "LTOD",
  "DATE_AND_TIME",
  "DT",
  "LDT",
  "STRING",
  "WSTRING",
  "CHAR",
  "WCHAR",
  "ANY",
  // Keywords.
  "ACTION",
  "AND",
  "ARRAY",
  "AT",
  "BY",
  "CASE",
  "CONFIGURATION",
  "CONSTANT",
  "DO",
  "ELSE",
  "ELSIF",
  "END_ACTION",
  "END_CASE",
  "END_CONFIGURATION",
  "END_FOR",
  "END_FUNCTION",
  "END_FUNCTION_BLOCK",
  "END_IF",
  "END_PROGRAM",
  "END_REPEAT",
  "END_RESOURCE",
  "END_STEP",
  "END_STRUCT",
  "END_TRANSITION",
  "END_TYPE",
  "END_VAR",
  "END_WHILE",
  "EXIT",
  "FALSE",
  "FOR",
  "FROM",
  "FUNCTION",
  "FUNCTION_BLOCK",
  "IF",
  "INITIAL_STEP",
  "MOD",
  "NOT",
  "OF",
  "ON",
  "OR",
  "PROGRAM",
  "READ_ONLY",
  "READ_WRITE",
  "REPEAT",
  "RESOURCE",
  "RETAIN",
  "NON_RETAIN",
  "RETURN",
  "STEP",
  "STRUCT",
  "TASK",
  "THEN",
  "TO",
  "TRANSITION",
  "TRUE",
  "TYPE",
  "UNTIL",
  "VAR",
  "VAR_ACCESS",
  "VAR_CONFIG",
  "VAR_EXTERNAL",
  "VAR_GLOBAL",
  "VAR_INPUT",
  "VAR_IN_OUT",
  "VAR_OUTPUT",
  "VAR_TEMP",
  "WHILE",
  "WITH",
  "XOR",
  // CODESYS additions.
  "ADR",
  "BITADR",
  "SIZEOF",
  "THIS",
  "SUPER",
  "POINTER",
  "REFERENCE",
  "METHOD",
  "PROPERTY",
  "INTERFACE",
  "EXTENDS",
  "IMPLEMENTS",
  "ABSTRACT",
  "FINAL",
  "UNION",
  "ENUM",
]);

/** Why a name cannot be a variable, as a sentence; null when it can. */
export function variableProblemOf(name: string): string | null {
  if (name.length > VARIABLE_MAX_LENGTH) {
    return `Variable "${name}" is longer than ${VARIABLE_MAX_LENGTH} characters.`;
  }
  if (!VARIABLE_PATTERN.test(name)) {
    return `Variable "${name}" must start with a letter, then hold letters, digits and single underscores, with no leading, trailing or double underscore.`;
  }
  if (RESERVED_NAMES.has(name.toUpperCase())) {
    return `Variable "${name}" is an IEC 61131-3 keyword or type name.`;
  }
  return null;
}

/**
 * A CODESYS variable from a tag name: "." and "-" become "_", runs of "_" are
 * collapsed, leading and trailing "_" removed, "t_" prefixed to a name that
 * starts with a digit; a name over 64 characters is cut at 56, loses its
 * trailing "_" and gets "_" plus the first 7 hex characters of the SHA-256 of
 * the tag name. Collisions are left for the validation to report.
 */
export function deriveVariable(tagName: string): string {
  const base = tagName.replace(/[.-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const prefixed = /^[0-9]/.test(base) ? `t_${base}` : base;
  if (prefixed.length <= VARIABLE_MAX_LENGTH) {
    return prefixed;
  }
  const hash = createHash("sha256").update(tagName).digest("hex").slice(0, HASH_CHARACTERS);
  return `${prefixed.slice(0, CUT_LENGTH).replace(/_+$/, "")}_${hash}`;
}
