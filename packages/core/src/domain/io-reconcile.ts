import type { IoDocument, PantinDocument } from "@pantin/protocol";
import { canonicalIoDocument, type IoReading } from "./io-document-text.ts";
import { renamedTags } from "./tags.ts";

// Renames carry over into io.json (ADR 0049 point 10): when a tag is renamed in
// the document, its channel follows. Pure; the service keeps the document the
// mapping was last aligned with and calls this on every read of the mapping.

/**
 * The mapping with the renames between `aligned` and `current` applied to its
 * channels' `tag`; the same object when nothing changes. `variable` is never
 * touched: the PLC program keeps working.
 */
export function carryRenames(
  reading: IoReading,
  aligned: PantinDocument,
  current: PantinDocument,
): IoReading {
  if (reading.kind !== "document" || aligned === current) {
    return reading;
  }
  const carried = carriedRenames(reading.document, renamedTags(aligned, current));
  if (carried.size === 0) {
    return reading;
  }
  const document: IoDocument = {
    ...reading.document,
    modules: reading.document.modules.map((module) => ({
      ...module,
      channels: module.channels.map((channel) => ({
        ...channel,
        tag: carried.get(channel.tag) ?? channel.tag,
      })),
    })),
  };
  return { kind: "document", document: canonicalIoDocument(document) };
}

// A rename onto a tag that a channel keeps is refused: two channels would map
// one tag, and the stale one is the user's to delete. A channel keeps its tag
// when it is not renamed, or when its own rename is refused, which can in turn
// free or block another target. So the set is resolved to a fixed point (every
// refusal only shrinks it), then applied at once so that swaps and chains work.
function carriedRenames(
  document: IoDocument,
  renames: readonly { from: string; to: string }[],
): Map<string, string> {
  const mappedTags = new Set(document.modules.flatMap((m) => m.channels.map((c) => c.tag)));
  const carried = new Map(
    renames.filter(({ from }) => mappedTags.has(from)).map(({ from, to }) => [from, to]),
  );
  let refused = true;
  while (refused) {
    refused = false;
    for (const [from, to] of carried) {
      if (mappedTags.has(to) && !carried.has(to)) {
        carried.delete(from);
        refused = true;
      }
    }
  }
  return carried;
}
