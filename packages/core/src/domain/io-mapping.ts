import type { IoMappingResponse, PantinId, TagDirection, TagType } from "@pantin/protocol";

// The seam between the tag bus and the I/O mapping (ADR 0045 points 6, 7, 10
// and 11). `IoMappingSource` is implemented over io.csv and io-modules.json
// by the service (slice P2); tests give the bus a fake one.

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

/** The mapping the bus works with: only a valid answer of GET .../io is one. */
export function mappingOf(answer: IoMappingResponse): IoMapping | null {
  if (answer.status !== "valid" || answer.mappingId === null) {
    return null;
  }
  const rows = answer.rows.flatMap((row) =>
    row.type === null || row.direction === null
      ? []
      : [{ tag: row.tag, module: row.module, type: row.type, direction: row.direction }],
  );
  return { mappingId: answer.mappingId, rows };
}
