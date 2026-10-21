import type {
  IoMappingResponse,
  PantinId,
  TagDirection,
  TagType,
  TransportKind,
} from "@pantin/protocol";

// The seam between the tag bus and the I/O mapping (ADR 0045 points 6, 7, 10
// and 11, ADR 0049 point 7). `IoMappingSource` is implemented over the open
// mapping by the service; tests give the bus a fake one.

export type IoMappingRow = {
  tag: string;
  // A module key of io.json.
  module: string;
  type: TagType;
  direction: TagDirection;
};

export type IoMapping = {
  // The id GET .../io answers: of the whole file, or of a transport's projection (ADR 0065).
  mappingId: string;
  // The keys of every module of the mapping, channels or not.
  moduleKeys: readonly string[];
  rows: readonly IoMappingRow[];
};

export type IoMappingSource = {
  // The valid open mapping of the Pantin, projected on `transport` (ADR 0065 point 7); null
  // when there is none (missing, unreadable or with problems).
  read(pantinId: PantinId, transport: TransportKind): Promise<IoMapping | null>;
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
  const rows = answer.modules.flatMap((module) =>
    module.channels.flatMap((channel) =>
      channel.tagType === null || channel.direction === null
        ? []
        : [
            {
              tag: channel.tag,
              module: module.key,
              type: channel.tagType,
              direction: channel.direction,
            },
          ],
    ),
  );
  return {
    mappingId: answer.mappingId,
    moduleKeys: answer.modules.map((module) => module.key),
    rows,
  };
}
