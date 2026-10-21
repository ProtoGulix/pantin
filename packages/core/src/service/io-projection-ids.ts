import type { PantinDocument, TransportKind } from "@pantin/protocol";
import { type IoReading, mappingIdOf } from "../domain/io-document-text.ts";
import { evaluateIoMapping, ioTagsOf } from "../domain/io-evaluation.ts";
import type { OpenPantin } from "./open-pantins.ts";

// The id of the open mapping, whole or projected on one transport kind (ADR 0065 point 7),
// for the bus tick. A projection needs the validation of the whole file, so its id is
// remembered until the mapping or the document is replaced: an edit replaces both objects,
// a tick replaces neither.

type RememberedIds = {
  io: IoReading;
  document: PantinDocument;
  byTransport: Map<TransportKind, string | null>;
};

const remembered = new WeakMap<OpenPantin, RememberedIds>();

function rememberedIdsOf(openPantin: OpenPantin): RememberedIds {
  const known = remembered.get(openPantin);
  if (known?.io === openPantin.io && known.document === openPantin.document) {
    return known;
  }
  const fresh = { io: openPantin.io, document: openPantin.document, byTransport: new Map() };
  remembered.set(openPantin, fresh);
  return fresh;
}

/** The mapping id of a transport's projection; with no transport, of the whole file. */
export function mappingIdOfOpenPantin(
  openPantin: OpenPantin,
  transport: TransportKind | null,
): string | null {
  if (transport === null) {
    return mappingIdOf(openPantin.io);
  }
  const ids = rememberedIdsOf(openPantin).byTransport;
  if (!ids.has(transport)) {
    const answer = evaluateIoMapping(openPantin.io, ioTagsOf(openPantin.document), transport);
    ids.set(transport, answer.mappingId);
  }
  return ids.get(transport) ?? null;
}
