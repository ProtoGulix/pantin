import type { PantinDocument, PantinId, PantinResponse } from "@pantin/protocol";
import type { StepConverter } from "../converter/step-converter.ts";
import { parsePantinDocument, serializePantinDocument } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { PantinStore } from "../store/pantin-store.ts";

// In-memory Pantins of one service instance: documents are edited here and
// written to disk only on save.

export type OpenPantin = { document: PantinDocument; savedText: string };
// Promises, not values: two requests loading the same Pantin at once share
// one load, hence one OpenPantin object that both edit.
export type ServiceContext = {
  store: PantinStore;
  openPantins: Map<PantinId, Promise<OpenPantin>>;
  // Undefined when the core was started without --step-converter-python.
  stepConverter: StepConverter | undefined;
};

export function toResponse(pantinId: PantinId, openPantin: OpenPantin): PantinResponse {
  const unsavedChanges = serializePantinDocument(openPantin.document) !== openPantin.savedText;
  return { id: pantinId, unsavedChanges, document: openPantin.document };
}

export function loadPantin(context: ServiceContext, pantinId: PantinId): Promise<OpenPantin> {
  const alreadyOpen = context.openPantins.get(pantinId);
  if (alreadyOpen !== undefined) {
    return alreadyOpen;
  }
  const loading = readPantinFromDisk(context, pantinId);
  context.openPantins.set(pantinId, loading);
  // A failed load is not cached: the file may be fixed and read again.
  loading.catch(() => context.openPantins.delete(pantinId));
  return loading;
}

async function readPantinFromDisk(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<OpenPantin> {
  const text = await context.store.readDocumentText(pantinId);
  if (text === undefined) {
    throw new ApiError(
      "not_found",
      `No Pantin with id "${pantinId}". List them with GET /api/pantins.`,
    );
  }
  const location = context.store.describeDocumentLocation(pantinId);
  const document = parsePantinDocument(text, location);
  // Compare against the canonical form, so a hand formatted file is not "unsaved".
  return { document, savedText: serializePantinDocument(document) };
}

export async function updateDocument(
  context: ServiceContext,
  pantinId: PantinId,
  edit: (document: PantinDocument) => PantinDocument,
): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  openPantin.document = edit(openPantin.document);
  return toResponse(pantinId, openPantin);
}
