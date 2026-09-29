import type {
  CreateJointRequest,
  ImportBodyQuery,
  PantinId,
  PantinResponse,
  PantinSummary,
} from "@pantin/protocol";
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
import {
  createJoint,
  deleteJoint,
  getPose,
  getPoseSnapshot,
  listJoints,
  setJointPosition,
  toPoseSnapshot,
} from "./joint-operations.ts";
import { deleteBody, discardPantin, savePantin } from "./mesh-lifecycle.ts";
import {
  loadPantin,
  newOpenPantin,
  type OpenPantin,
  readSavedDocument,
  type ServiceContext,
  toResponse,
  updateDocument,
} from "./open-pantins.ts";
import { listTags, runSimulationSteps, writeTag } from "./simulation.ts";

// Orchestrates the Pantins: documents are edited in memory and written to disk
// only on save. One service per server instance, no shared state.

function ignoreApiError(error: unknown): undefined {
  if (error instanceof ApiError) {
    return undefined;
  }
  throw error;
}

// Open Pantins show their in-memory document (unsaved renames included);
// the others are read from disk without being opened.
async function readSummaryDocument(context: ServiceContext, pantinId: PantinId) {
  const open: Promise<OpenPantin> | undefined = context.openPantins.get(pantinId);
  return open === undefined ? readSavedDocument(context, pantinId) : (await open).document;
}

async function listPantins(context: ServiceContext): Promise<PantinSummary[]> {
  const folderNames = await context.store.listFolderNames();
  const summaries: PantinSummary[] = [];
  for (const folderName of folderNames.sort()) {
    const idResult = PantinIdSchema.safeParse(folderName);
    // Folders that are not Pantins (bad name, no or invalid pantin.json) are
    // left out of the list; GET on one of them explains what is wrong.
    const document = idResult.success
      ? await readSummaryDocument(context, idResult.data).catch(ignoreApiError)
      : undefined;
    if (idResult.success && document !== undefined) {
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
  await context.store.writeDocumentAtomically(pantinId, serializePantinDocument(document));
  const openPantin = newOpenPantin(document);
  context.openPantins.set(pantinId, Promise.resolve(openPantin));
  context.loadedPantins.set(pantinId, openPantin);
  return toResponse(pantinId, openPantin);
}

export function createPantinService(store: PantinStore, stepConverter: StepConverter | undefined) {
  const context: ServiceContext = {
    store,
    openPantins: new Map(),
    loadedPantins: new Map(),
    stepConverter,
  };
  return {
    listPantins: () => listPantins(context),
    createPantin: (name: string) => createPantin(context, name),
    getPantin: async (pantinId: PantinId) =>
      toResponse(pantinId, await loadPantin(context, pantinId)),
    renamePantin: (pantinId: PantinId, name: string) =>
      updateDocument(context, pantinId, (document) => renamePantinDocument(document, name)),
    savePantin: (pantinId: PantinId) => savePantin(context, pantinId),
    discardPantin: (pantinId: PantinId) => discardPantin(context, pantinId),
    deleteBody: (pantinId: PantinId, bodyId: string) => deleteBody(context, pantinId, bodyId),
    importBodies: (pantinId: PantinId, query: ImportBodyQuery, bytes: Uint8Array) =>
      importBodies(context, pantinId, query, bytes),
    renameBody: (pantinId: PantinId, bodyId: string, name: string) =>
      renameBodyOf(context, pantinId, bodyId, name),
    openBodyMesh: (pantinId: PantinId, meshPath: string) =>
      openBodyMesh(context, pantinId, meshPath),
    listJoints: (pantinId: PantinId) => listJoints(context, pantinId),
    createJoint: (pantinId: PantinId, request: CreateJointRequest) =>
      createJoint(context, pantinId, request),
    deleteJoint: (pantinId: PantinId, jointId: string) => deleteJoint(context, pantinId, jointId),
    getPose: (pantinId: PantinId) => getPose(context, pantinId),
    getPoseSnapshot: (pantinId: PantinId) => getPoseSnapshot(context, pantinId),
    // Sync, for the simulation tick: only Pantins already loaded.
    peekStepCount: (pantinId: PantinId) => context.loadedPantins.get(pantinId)?.stepCount,
    peekPoseSnapshot: (pantinId: PantinId) => {
      const openPantin = context.loadedPantins.get(pantinId);
      return openPantin === undefined ? undefined : toPoseSnapshot(openPantin);
    },
    setJointPosition: (pantinId: PantinId, jointId: string, position: number) =>
      setJointPosition(context, pantinId, jointId, position),
    listTags: (pantinId: PantinId) => listTags(context, pantinId),
    writeTag: (pantinId: PantinId, tagName: string, value: number) =>
      writeTag(context, pantinId, tagName, value),
    runSimulationSteps: (steps: number) => runSimulationSteps(context, steps),
  };
}

export type PantinService = ReturnType<typeof createPantinService>;
