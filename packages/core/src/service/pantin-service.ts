import type { ImportBodyQuery, PantinId, PantinResponse, PantinSummary } from "@pantin/protocol";
import { PantinIdSchema } from "@pantin/protocol";
import type { StepConverter } from "../converter/step-converter.ts";
import { makeUniqueId, slugifyDisplayName } from "../domain/ids.ts";
import {
  createPantinDocument,
  renamePantinDocument,
  serializePantinDocument,
} from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { PantinStore } from "../store/pantin-store.ts";
import { openBodyMesh, renameBodyOf } from "./body-operations.ts";
import { importBodies } from "./import-operations.ts";
import { loadPantin, type ServiceContext, toResponse, updateDocument } from "./open-pantins.ts";

// Orchestrates the Pantins: documents are edited in memory and written to disk
// only on save. One service per server instance, no shared state.

function ignoreApiError(error: unknown): undefined {
  if (error instanceof ApiError) {
    return undefined;
  }
  throw error;
}

async function listPantins(context: ServiceContext): Promise<PantinSummary[]> {
  const folderNames = await context.store.listFolderNames();
  const summaries: PantinSummary[] = [];
  for (const folderName of folderNames.sort()) {
    const idResult = PantinIdSchema.safeParse(folderName);
    // Folders that are not Pantins (bad name, no or invalid pantin.json) are
    // left out of the list; GET on one of them explains what is wrong.
    const openPantin = idResult.success
      ? await loadPantin(context, idResult.data).catch(ignoreApiError)
      : undefined;
    if (idResult.success && openPantin !== undefined) {
      const { document } = openPantin;
      summaries.push({ id: idResult.data, name: document.name, bodyCount: document.bodies.length });
    }
  }
  return summaries;
}

async function createPantin(context: ServiceContext, name: string): Promise<PantinResponse> {
  const takenIds = new Set([
    ...(await context.store.listFolderNames()),
    ...context.openPantins.keys(),
  ]);
  const pantinId = makeUniqueId(slugifyDisplayName(name, "pantin"), takenIds);
  await context.store.createPantinFolder(pantinId);
  const document = createPantinDocument(name);
  const savedText = serializePantinDocument(document);
  await context.store.writeDocumentAtomically(pantinId, savedText);
  const openPantin = { document, savedText };
  context.openPantins.set(pantinId, Promise.resolve(openPantin));
  return toResponse(pantinId, openPantin);
}

async function savePantin(context: ServiceContext, pantinId: PantinId): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  const text = serializePantinDocument(openPantin.document);
  await context.store.writeDocumentAtomically(pantinId, text);
  openPantin.savedText = text;
  return toResponse(pantinId, openPantin);
}

export function createPantinService(store: PantinStore, stepConverter: StepConverter | undefined) {
  const context: ServiceContext = { store, openPantins: new Map(), stepConverter };
  return {
    listPantins: () => listPantins(context),
    createPantin: (name: string) => createPantin(context, name),
    getPantin: async (pantinId: PantinId) =>
      toResponse(pantinId, await loadPantin(context, pantinId)),
    renamePantin: (pantinId: PantinId, name: string) =>
      updateDocument(context, pantinId, (document) => renamePantinDocument(document, name)),
    savePantin: (pantinId: PantinId) => savePantin(context, pantinId),
    importBodies: (pantinId: PantinId, query: ImportBodyQuery, bytes: Uint8Array) =>
      importBodies(context, pantinId, query, bytes),
    renameBody: (pantinId: PantinId, bodyId: string, name: string) =>
      renameBodyOf(context, pantinId, bodyId, name),
    openBodyMesh: (pantinId: PantinId, meshPath: string) =>
      openBodyMesh(context, pantinId, meshPath),
  };
}

export type PantinService = ReturnType<typeof createPantinService>;
