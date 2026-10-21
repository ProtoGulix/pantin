import type { SignalType } from "../schema-common.ts";

// The IEC types an OPC UA channel may carry, per signal type, and the OPC UA data type
// each one is read and written as (ADR 0065 point 2). Plain data: the schema, the rules
// and the bridge's node check all read this one table. The first type of each list is
// the default of its signal type.

export const OPCUA_IEC_TYPES = ["BOOL", "REAL", "LREAL", "INT", "DINT", "LINT"] as const;
export type OpcuaIecType = (typeof OPCUA_IEC_TYPES)[number];

export const OPCUA_IEC_TYPES_BY_SIGNAL_TYPE: Readonly<
  Record<SignalType, readonly [OpcuaIecType, ...OpcuaIecType[]]>
> = {
  bit: ["BOOL"],
  float: ["REAL", "LREAL"],
  integer: ["DINT", "INT", "LINT"],
};

// NOT VERIFIED: Int64 values against JavaScript numbers (ADR 0065 Context).
export const OPCUA_DATA_TYPE_BY_IEC_TYPE: Readonly<Record<OpcuaIecType, string>> = {
  BOOL: "Boolean",
  REAL: "Float",
  LREAL: "Double",
  INT: "Int16",
  DINT: "Int32",
  LINT: "Int64",
};
