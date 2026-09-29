import type { PantinId, PantinResponse } from "@pantin/protocol";
import { findBody, removeBodies, serializePantinDocument } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import {
  loadPantin,
  meshPathsOf,
  type OpenPantin,
  readSavedDocument,
  type ServiceContext,
  toResponse,
} from "./open-pantins.ts";

// Save and mesh deletion, kept together because their order matters: the
// disk must never hold a pantin.json that references a missing mesh file.

function isReferencedOnDisk(openPantin: OpenPantin, meshPath: string): boolean {
  return openPantin.savedMeshPaths.has(meshPath) || openPantin.writingMeshPaths.has(meshPath);
}

// Called when no body of the in-memory document uses `meshPath` any more.
export async function releaseMesh(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
  meshPath: string,
): Promise<void> {
  if (isReferencedOnDisk(openPantin, meshPath)) {
    openPantin.pendingMeshDeletions.add(meshPath);
    return;
  }
  await context.store.deleteMesh(pantinId, meshPath);
}

async function deletePendingMeshes(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
): Promise<void> {
  for (const meshPath of [...openPantin.pendingMeshDeletions]) {
    const isStillUsed = meshPathsOf(openPantin.document).has(meshPath);
    if (!isReferencedOnDisk(openPantin, meshPath) && !isStillUsed) {
      openPantin.pendingMeshDeletions.delete(meshPath);
      await context.store.deleteMesh(pantinId, meshPath);
    }
  }
}

// Never serialise nor replace a document whose bodies' meshes are still being
// written: wait until every import in flight has written its meshes or rolled back.
export async function waitForImports(openPantin: OpenPantin): Promise<void> {
  while (openPantin.inFlightImports.size > 0) {
    await Promise.all(openPantin.inFlightImports);
  }
}

async function writeDocument(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
): Promise<void> {
  await waitForImports(openPantin);
  const document = openPantin.document;
  const text = serializePantinDocument(document);
  openPantin.writingMeshPaths = meshPathsOf(document);
  try {
    await context.store.writeDocumentAtomically(pantinId, text);
    openPantin.savedText = text;
    openPantin.savedMeshPaths = openPantin.writingMeshPaths;
  } finally {
    openPantin.writingMeshPaths = new Set();
  }
  await deletePendingMeshes(context, pantinId, openPantin);
}

// Runs `task` after the saves and discards already queued for this Pantin.
async function runQueued(openPantin: OpenPantin, task: () => Promise<void>): Promise<void> {
  const running = openPantin.saveQueue.then(task);
  // The queue continues after a failure; this caller still gets the error.
  openPantin.saveQueue = running.catch(() => undefined);
  await running;
}

export async function savePantin(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  await runQueued(openPantin, () => writeDocument(context, pantinId, openPantin));
  return toResponse(pantinId, openPantin);
}

async function reloadDocument(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
): Promise<void> {
  const saved = await readSavedDocument(context, pantinId);
  await waitForImports(openPantin);
  // From here to the reset, no await: no import can slip in between.
  const savedMeshPaths = meshPathsOf(saved);
  const candidates = [...meshPathsOf(openPantin.document), ...openPantin.pendingMeshDeletions];
  const unsavedMeshes = new Set(candidates.filter((meshPath) => !savedMeshPaths.has(meshPath)));
  openPantin.document = saved;
  openPantin.savedText = serializePantinDocument(saved);
  openPantin.savedMeshPaths = savedMeshPaths;
  openPantin.pendingMeshDeletions.clear();
  openPantin.jointPositions.clear();
  for (const meshPath of unsavedMeshes) {
    await context.store.deleteMesh(pantinId, meshPath);
  }
}

// Throws away unsaved edits. A Pantin that is not open has none: it is
// simply loaded.
export async function discardPantin(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<PantinResponse> {
  const wasOpen = context.openPantins.has(pantinId);
  const openPantin = await loadPantin(context, pantinId);
  if (wasOpen) {
    await runQueued(openPantin, () => reloadDocument(context, pantinId, openPantin));
  }
  return toResponse(pantinId, openPantin);
}

export async function deleteBody(
  context: ServiceContext,
  pantinId: PantinId,
  bodyId: string,
): Promise<PantinResponse> {
  const openPantin = await loadPantin(context, pantinId);
  // A body whose mesh is still being written would leave a stray file once
  // the write lands: let imports settle (written or rolled back) first.
  await waitForImports(openPantin);
  const body = findBody(openPantin.document, bodyId);
  if (body === undefined) {
    throw new ApiError("not_found", `Pantin "${pantinId}" has no body "${bodyId}".`);
  }
  const joint = openPantin.document.joints.find(
    (candidate) => candidate.parent === bodyId || candidate.child === bodyId,
  );
  if (joint !== undefined) {
    throw new ApiError(
      "conflict",
      `Body "${bodyId}" is used by joint "${joint.id}". Delete the joint first.`,
    );
  }
  openPantin.document = removeBodies(openPantin.document, new Set([bodyId]));
  await releaseMesh(context, pantinId, openPantin, body.mesh);
  return toResponse(pantinId, openPantin);
}
