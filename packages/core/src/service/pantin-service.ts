import type {
  Body,
  ImportBodyQuery,
  PantinDocument,
  PantinId,
  PantinResponse,
  PantinSummary,
} from "@pantin/protocol";
import { PantinIdSchema } from "@pantin/protocol";
import { fileNameStem, makeUniqueId, slugifyDisplayName } from "../domain/ids.ts";
import { buildImportedBody } from "../domain/import-body.ts";
import {
  addBody,
  createPantinDocument,
  findBody,
  parsePantinDocument,
  removeBody,
  renameBody,
  renamePantinDocument,
  serializePantinDocument,
} from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { MeshFile, PantinStore } from "../store/pantin-store.ts";

// Orchestrates the Pantins: documents are edited in memory and written to disk
// only on save. One service per server instance, no shared state.

type OpenPantin = { document: PantinDocument; savedText: string };
// Promises, not values: two requests loading the same Pantin at once share
// one load, hence one OpenPantin object that both edit.
type ServiceContext = { store: PantinStore; openPantins: Map<PantinId, Promise<OpenPantin>> };

function toResponse(pantinId: PantinId, openPantin: OpenPantin): PantinResponse {
  const unsavedChanges = serializePantinDocument(openPantin.document) !== openPantin.savedText;
  return { id: pantinId, unsavedChanges, document: openPantin.document };
}

function loadPantin(context: ServiceContext, pantinId: PantinId): Promise<OpenPantin> {
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

async function updateDocument(
  context: ServiceContext,
  pantinId: PantinId,
  edit: (document: PantinDocument) => PantinDocument,
): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  openPantin.document = edit(openPantin.document);
  return toResponse(pantinId, openPantin);
}

async function savePantin(context: ServiceContext, pantinId: PantinId): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  const text = serializePantinDocument(openPantin.document);
  await context.store.writeDocumentAtomically(pantinId, text);
  openPantin.savedText = text;
  return toResponse(pantinId, openPantin);
}

async function importBody(
  context: ServiceContext,
  pantinId: PantinId,
  query: ImportBodyQuery,
  bytes: Uint8Array,
): Promise<Body> {
  const openPantin = await loadPantin(context, pantinId);
  const meshStems = (await context.store.listMeshFileNames(pantinId)).map(fileNameStem);
  // No await between building the body and adding it: the id is reserved
  // before a concurrent import can pick the same one.
  const body = buildImportedBody(openPantin.document, query, bytes, meshStems);
  openPantin.document = addBody(openPantin.document, body);
  try {
    // The mesh is written now; the body joins pantin.json on the next save.
    await context.store.writeMesh(pantinId, body.mesh, bytes);
  } catch (error) {
    openPantin.document = removeBody(openPantin.document, body.id);
    throw error;
  }
  return body;
}

async function renameBodyOf(
  context: ServiceContext,
  pantinId: PantinId,
  bodyId: string,
  name: string,
): Promise<Body> {
  const response = await updateDocument(context, pantinId, (document) => {
    if (findBody(document, bodyId) === undefined) {
      throw new ApiError("not_found", `Pantin "${pantinId}" has no body "${bodyId}".`);
    }
    return renameBody(document, bodyId, name);
  });
  const body = findBody(response.document, bodyId);
  if (body === undefined) {
    throw new ApiError("internal_error", `Body "${bodyId}" vanished while being renamed.`);
  }
  return body;
}

// Serves only a file that a body of this Pantin lists as its mesh.
async function openBodyMesh(
  context: ServiceContext,
  pantinId: PantinId,
  meshPath: string,
): Promise<{ file: MeshFile; format: Body["source"]["format"] }> {
  const { document } = await loadPantin(context, pantinId);
  const body = document.bodies.find((candidate) => candidate.mesh === meshPath);
  if (body === undefined) {
    throw new ApiError("not_found", `Pantin "${pantinId}" has no mesh "${meshPath}".`);
  }
  return { file: await context.store.openMesh(pantinId, body.mesh), format: body.source.format };
}

export function createPantinService(store: PantinStore) {
  const context: ServiceContext = { store, openPantins: new Map() };
  return {
    listPantins: () => listPantins(context),
    createPantin: (name: string) => createPantin(context, name),
    getPantin: async (pantinId: PantinId) =>
      toResponse(pantinId, await loadPantin(context, pantinId)),
    renamePantin: (pantinId: PantinId, name: string) =>
      updateDocument(context, pantinId, (document) => renamePantinDocument(document, name)),
    savePantin: (pantinId: PantinId) => savePantin(context, pantinId),
    importBody: (pantinId: PantinId, query: ImportBodyQuery, bytes: Uint8Array) =>
      importBody(context, pantinId, query, bytes),
    renameBody: (pantinId: PantinId, bodyId: string, name: string) =>
      renameBodyOf(context, pantinId, bodyId, name),
    openBodyMesh: (pantinId: PantinId, meshPath: string) =>
      openBodyMesh(context, pantinId, meshPath),
  };
}

export type PantinService = ReturnType<typeof createPantinService>;
