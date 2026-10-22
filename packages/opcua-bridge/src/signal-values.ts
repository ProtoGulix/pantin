import type { OpcuaIecType } from "@pantin/protocol";

// What the bridge knows of the OPC UA data types, as plain data and pure functions: the
// type each IEC type is read and written as (ADR 0065 point 2) and how a tag value becomes
// the PLC's integer. The node-opcua `Variant` is built from these in opcua/variants.ts.

/** The OPC UA data type names, spelled like node-opcua's `DataType` enum. */
export type DataTypeName = "Boolean" | "Float" | "Double" | "Int16" | "Int32" | "Int64";

export const DATA_TYPE_BY_IEC_TYPE: Readonly<Record<OpcuaIecType, DataTypeName>> = {
  BOOL: "Boolean",
  REAL: "Float",
  LREAL: "Double",
  INT: "Int16",
  DINT: "Int32",
  LINT: "Int64",
};

const INTEGER_BITS: Readonly<Partial<Record<OpcuaIecType, number>>> = {
  INT: 16,
  DINT: 32,
  LINT: 64,
};

const WORD_BITS = 32n;
const WORD_MASK = 0xffff_ffffn;

/**
 * A tag integer as the PLC's variable holds it: truncated toward zero, then wrapped like a
 * hardware counter (32767 + 1 is -32768 in an INT). Other types pass through unchanged.
 */
export function wrapToIecType(iecType: OpcuaIecType, value: number): number {
  const bits = INTEGER_BITS[iecType];
  if (bits === undefined) {
    return value;
  }
  return Number(BigInt.asIntN(bits, BigInt(Math.trunc(value))));
}

/** The two unsigned 32 bit halves node-opcua uses for an Int64: [high, low]. */
export function int64ToWords(value: number): [number, number] {
  const wrapped = BigInt.asUintN(64, BigInt(Math.trunc(value)));
  return [Number(wrapped >> WORD_BITS), Number(wrapped & WORD_MASK)];
}

/**
 * The inverse of `int64ToWords`. A tag value is a JavaScript number, so an Int64 beyond
 * 2^53 loses its low bits here: the simulation's tags cannot hold more (ADR 0065 point 2).
 */
export function wordsToInt64(high: number, low: number): number {
  return Number(BigInt.asIntN(64, (BigInt(high) << WORD_BITS) | BigInt(low)));
}
