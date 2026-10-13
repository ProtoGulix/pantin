import type { PantinId, TagDirection, TagType } from "@pantin/protocol";

// The seam between the tag bus and the I/O mapping (ADR 0045 points 6, 7, 10
// and 11). Phase 7 slice P1 builds the bus; slice P2 reads io.csv and
// io-modules.json and implements `IoMappingSource` over them. Until then the
// core runs with `NO_IO_MAPPING`, which has no mapping for any Pantin.

export type IoMappingRow = {
  tag: string;
  // A module key from io-modules.json.
  module: string;
  type: TagType;
  direction: TagDirection;
};

export type IoMapping = {
  // SHA-256 of the two mapping files, as GET .../io answers it.
  mappingId: string;
  rows: readonly IoMappingRow[];
};

export type IoMappingSource = {
  // The valid mapping of the Pantin, read from disk now; null when there is
  // none (files missing, or invalid).
  read(pantinId: PantinId): Promise<IoMapping | null>;
};

export const NO_IO_MAPPING: IoMappingSource = { read: async () => null };

/**
 * The bit command tags the watchdog resets (ADR 0045 point 11), of one module
 * or, with no module, of all of them. Float and integer commands keep their
 * value.
 */
export function watchdogTags(mapping: IoMapping, module?: string): string[] {
  return mapping.rows
    .filter((row) => row.type === "bit" && row.direction === "command")
    .filter((row) => module === undefined || row.module === module)
    .map((row) => row.tag);
}
