import type { IoType, IoZone, TagDirection, TagType } from "@pantin/protocol";

// What ADR 0045 point 8 fixes about a mapped tag: each valid (tag type,
// direction) pair has exactly one zone and one PLC type. Shared by the
// validation of io.json and by the frozen CSV one (legacy-csv/).

export const BIT_ZONES: readonly IoZone[] = ["coil", "discrete_input"];
export const ZONES_BY_DIRECTION: Record<TagDirection, readonly IoZone[]> = {
  command: ["coil", "holding_register"],
  feedback: ["discrete_input", "input_register"],
};
export const IO_TYPE_BY_TAG_TYPE: Record<TagType, IoType> = {
  bit: "BOOL",
  float: "REAL",
  integer: "DINT",
};

/** Registers (or bits) a mapped value takes: REAL and DINT take two registers. */
export function ioWidthOf(ioType: IoType): number {
  return ioType === "BOOL" ? 1 : 2;
}
