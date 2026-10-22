import type { SymbolCompatibility, SymbolWarning, TagType } from "@pantin/protocol";

// The type table every transport shares (ADR 0064 point 12): which IEC types can
// carry a signal of each type. A transport adds its own warnings on top
// (TransportRules.symbolWarnings); nothing here names a transport.

const EXACT_TYPES: Readonly<Record<TagType, ReadonlySet<string>>> = {
  bit: new Set(["BOOL"]),
  float: new Set(["REAL", "LREAL"]),
  integer: new Set(["DINT", "LINT"]),
};

// Integers that hold the values of a signal in most cases but not in all: another
// width or no sign. A person decides.
const NARROWER_INTEGER_TYPES: ReadonlySet<string> = new Set([
  "INT",
  "SINT",
  "UDINT",
  "UINT",
  "USINT",
  "ULINT",
  "BYTE",
  "WORD",
  "DWORD",
  "LWORD",
]);

export interface TypeAssessment {
  compatibility: SymbolCompatibility;
  warnings: SymbolWarning[];
}

// IEC names are case-insensitive.
const normalisedType = (iecType: string): string => iecType.trim().toUpperCase();

/** How well an IEC type carries a signal of this type. */
export function assessTypeCompatibility(signalType: TagType, iecType: string): TypeAssessment {
  const type = normalisedType(iecType);
  if (EXACT_TYPES[signalType].has(type)) {
    return { compatibility: "compatible", warnings: [] };
  }
  if (signalType === "integer" && NARROWER_INTEGER_TYPES.has(type)) {
    return {
      compatibility: "warning",
      warnings: [
        {
          code: "integer_may_not_fit",
          values: { iecType },
          message: `${iecType} is not a signed 32 or 64 bit integer: a value of the signal may not fit (range or sign).`,
        },
      ],
    };
  }
  return { compatibility: "incompatible", warnings: [] };
}

/** True when some signal type could be carried by this IEC type, with or without a warning. */
export function canCarryAnySignal(iecType: string): boolean {
  const type = normalisedType(iecType);
  return (
    Object.values(EXACT_TYPES).some((types) => types.has(type)) || NARROWER_INTEGER_TYPES.has(type)
  );
}
