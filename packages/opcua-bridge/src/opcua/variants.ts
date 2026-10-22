import type { OpcuaIecType } from "@pantin/protocol";
import { DataType, Variant, VariantArrayType } from "node-opcua-client";
import {
  DATA_TYPE_BY_IEC_TYPE,
  type DataTypeName,
  int64ToWords,
  wordsToInt64,
  wrapToIecType,
} from "../signal-values.ts";

// Tag numbers to the Variants the PLC's nodes hold, and back (ADR 0065 point 2). Values stay SI:
// nothing is scaled here, an integer only wraps to the width of its IEC type.

const DATA_TYPE: Readonly<Record<DataTypeName, DataType>> = {
  Boolean: DataType.Boolean,
  Float: DataType.Float,
  Double: DataType.Double,
  Int16: DataType.Int16,
  Int32: DataType.Int32,
  Int64: DataType.Int64,
};

export function toVariant(iecType: OpcuaIecType, tagValue: number): Variant {
  const name = DATA_TYPE_BY_IEC_TYPE[iecType];
  const value = wrapToIecType(iecType, tagValue);
  // node-opcua cannot guess the shape of a 64 bit integer: it wants the scalar named, and the
  // value as two 32 bit words.
  if (name === "Int64") {
    return new Variant({
      dataType: DataType.Int64,
      arrayType: VariantArrayType.Scalar,
      value: int64ToWords(value),
    });
  }
  return new Variant({
    dataType: DATA_TYPE[name],
    value: name === "Boolean" ? value !== 0 : value,
  });
}

/** The tag value of a node's Variant, or `undefined` when it is not a number the bridge reads. */
export function fromVariant(variant: Variant): number | undefined {
  const value: unknown = variant.value; // node-opcua types the payload as `any`
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value) && value.length === 2) {
    const [high, low] = value as unknown[]; // the two words of an Int64, checked just below
    return typeof high === "number" && typeof low === "number"
      ? wordsToInt64(high, low)
      : undefined;
  }
  return undefined;
}

/** The name of a node's DataType attribute (a NodeId of namespace 0), or "other". */
export function dataTypeNameOf(dataTypeId: number): DataTypeName | "other" {
  const found = (Object.keys(DATA_TYPE) as DataTypeName[]).find(
    // keys of the table above
    (name) => DATA_TYPE[name] === dataTypeId,
  );
  return found ?? "other";
}
