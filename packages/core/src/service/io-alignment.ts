import type { PantinDocument } from "@pantin/protocol";
import type { IoReading } from "../domain/io-document-text.ts";
import { carryRenames } from "../domain/io-reconcile.ts";

// The part of an open Pantin that renames carry over (ADR 0049 point 10). The
// structural type keeps this file free of open-pantins.ts, which uses it.
export type IoAlignable = {
  document: PantinDocument;
  io: IoReading;
  // The document the mapping was last aligned with.
  ioAlignedDocument: PantinDocument;
};

/**
 * Applies the renames made since the last read to the mapping, then records
 * the document. Every read of the mapping (route, bus, save, unsaved check)
 * goes through here: one read path, instead of a hook in each of the many
 * places that replace the document, and pairing by owner makes several edits
 * in a row resolve to the right names.
 */
export function alignIo(openPantin: IoAlignable): void {
  if (openPantin.ioAlignedDocument === openPantin.document) {
    return;
  }
  openPantin.io = carryRenames(openPantin.io, openPantin.ioAlignedDocument, openPantin.document);
  openPantin.ioAlignedDocument = openPantin.document;
}
