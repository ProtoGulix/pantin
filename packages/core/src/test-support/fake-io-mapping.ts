import type { IoMappingRow, IoMappingSource } from "../domain/io-mapping.ts";

// A stand-in for the I/O mapping of slice P2: the tag bus tests give it rows
// by hand. Every Pantin has the same mapping.

export const PLC_MAPPING_ID = "mapping-a";

export function fakeMappingSource(
  rows: readonly IoMappingRow[],
  mappingId = PLC_MAPPING_ID,
): IoMappingSource {
  const moduleKeys = [...new Set(rows.map((row) => row.module))];
  return { read: async () => ({ mappingId, moduleKeys, rows }) };
}
