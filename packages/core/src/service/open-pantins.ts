import type { PantinDocument, PantinId, PantinResponse } from "@pantin/protocol";
import type { StepConverter } from "../converter/step-converter.ts";
import { parsePantinDocument, serializePantinDocument } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { PantinStore } from "../store/pantin-store.ts";

// In-memory Pantins of one service instance: documents are edited here and
// written to disk only on save.

export type OpenPantin = {
  document: PantinDocument;
  // Canonical text of pantin.json on disk, to detect unsaved changes.
  savedText: string;
  // Meshes referenced by pantin.json on disk, and by the one being written.
  savedMeshPaths: Set<string>;
  writingMeshPaths: Set<string>;
  // Meshes of deleted bodies that pantin.json still references: deleted
  // after the next save, so the disk never references a missing mesh.
  pendingMeshDeletions: Set<string>;
  // Saves of one Pantin run one after the other.
  saveQueue: Promise<unknown>;
  // One promise per import whose bodies are in the document but whose mesh
  // files are still being written; resolves when the import settles.
  inFlightImports: Set<Promise<void>>;
};

export function meshPathsOf(document: PantinDocument): Set<string> {
  return new Set(document.bodies.map((body) => body.mesh));
}

// `document` is what pantin.json on disk contains.
export function newOpenPantin(document: PantinDocument): OpenPantin {
  return {
    document,
    savedText: serializePantinDocument(document),
    savedMeshPaths: meshPathsOf(document),
    writingMeshPaths: new Set(),
    pendingMeshDeletions: new Set(),
    saveQueue: Promise.resolve(),
    inFlightImports: new Set(),
  };
}
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

// Reads and validates pantin.json without opening the Pantin.
export async function readSavedDocument(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<PantinDocument> {
  const text = await context.store.readDocumentText(pantinId);
  if (text === undefined) {
    throw new ApiError(
      "not_found",
      `No Pantin with id "${pantinId}". List them with GET /api/pantins.`,
    );
  }
  const location = context.store.describeDocumentLocation(pantinId);
  return parsePantinDocument(text, location);
}

async function readPantinFromDisk(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<OpenPantin> {
  // Compared in canonical form, so a hand formatted file is not "unsaved".
  return newOpenPantin(await readSavedDocument(context, pantinId));
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
