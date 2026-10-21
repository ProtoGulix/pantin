import { isBodyEndpoint, type PantinId, type PantinResponse } from "@pantin/protocol";
import { refuseBodyUsedAsFrame } from "../domain/conveyor-rules.ts";
import { ioTextOf } from "../domain/io-document-text.ts";
import { findBody, removeBodies, serializePantinDocument } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import { alignIo } from "./io-alignment.ts";
import { isMigrated, readIoReading } from "./io-reading.ts";
import {
  loadPantin,
  meshPathsOf,
  type OpenPantin,
  readSavedDocument,
  resetRuntimeState,
  type ServiceContext,
  toResponse,
} from "./open-pantins.ts";

// Save and mesh deletion, kept together because their order matters: the
// disk must never hold a pantin.json that references a missing mesh file.

function isReferencedOnDisk(openPantin: OpenPantin, meshPath: string): boolean {
  return openPantin.savedMeshPaths.has(meshPath) || openPantin.writingMeshPaths.has(meshPath);
}

/**
 * Every mesh path that something still uses (ADR 0038 point 4): the in-memory
 * document, the saved pantin.json, a save in progress and the deletions
 * waiting for the next save. A mesh file outside this set is an orphan.
 */
export function meshPathsToKeep(openPantin: OpenPantin): Set<string> {
  return new Set([
    ...meshPathsOf(openPantin.document),
    ...openPantin.savedMeshPaths,
    ...openPantin.writingMeshPaths,
    ...openPantin.pendingMeshDeletions.keys(),
  ]);
}

// Called when no body of the in-memory document uses `meshPath` any more.
export async function releaseMesh(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
  meshPath: string,
): Promise<void> {
  if (isReferencedOnDisk(openPantin, meshPath)) {
    openPantin.pendingMeshDeletions.set(
      meshPath,
      openPantin.pendingMeshDeletions.get(meshPath) ?? 0,
    );
    return;
  }
  await context.store.deleteMesh(pantinId, meshPath);
}

function hasErrnoCode(reason: unknown): reason is { code: string } {
  return (
    typeof reason === "object" &&
    reason !== null &&
    "code" in reason &&
    typeof reason.code === "string"
  );
}

// After this many failed saves a file is given up on and left to the orphan
// cleanup (ADR 0038), where the user sees the I/O cause.
const MAX_MESH_DELETION_ATTEMPTS = 3;

// A deletion that fails stays pending and is retried at the next save, up to
// MAX_MESH_DELETION_ATTEMPTS times. Each failure goes to the server log with
// the mesh path of the document and the errno code, never an absolute path:
// the save itself succeeded and must answer so.
async function deletePendingMeshes(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
): Promise<void> {
  const meshPaths = [...openPantin.pendingMeshDeletions.keys()].filter(
    (meshPath) =>
      !isReferencedOnDisk(openPantin, meshPath) && !meshPathsOf(openPantin.document).has(meshPath),
  );
  const outcomes = await Promise.allSettled(
    meshPaths.map((meshPath) => context.store.deleteMesh(pantinId, meshPath)),
  );
  outcomes.forEach((outcome, at) => {
    const meshPath = meshPaths[at] ?? "";
    if (outcome.status === "fulfilled") {
      openPantin.pendingMeshDeletions.delete(meshPath);
      return;
    }
    const attempts = (openPantin.pendingMeshDeletions.get(meshPath) ?? 0) + 1;
    const code = hasErrnoCode(outcome.reason) ? outcome.reason.code : "unknown";
    const verdict =
      attempts >= MAX_MESH_DELETION_ATTEMPTS
        ? "left to the orphan cleanup"
        : "retried at the next save";
    context.reportError(
      new Error(
        `Could not delete mesh "${meshPath}" of Pantin "${pantinId}" (${code}), attempt ${attempts} of ${MAX_MESH_DELETION_ATTEMPTS}: ${verdict}.`,
      ),
    );
    if (attempts >= MAX_MESH_DELETION_ATTEMPTS) {
      openPantin.pendingMeshDeletions.delete(meshPath);
    } else {
      openPantin.pendingMeshDeletions.set(meshPath, attempts);
    }
  });
}

// Never serialise nor replace a document whose bodies' meshes are still being
// written: wait until every import in flight has written its meshes or rolled back.
export async function waitForImports(openPantin: OpenPantin): Promise<void> {
  while (openPantin.inFlightImports.size > 0) {
    await Promise.all(openPantin.inFlightImports);
  }
}

/** The open Pantin once its imports settled: a rollback may remove joints or an assembly. */
export async function loadSettledPantin(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<OpenPantin> {
  const openPantin = await loadPantin(context, pantinId);
  await waitForImports(openPantin);
  return openPantin;
}

// io.json first, only when its text changed (ADR 0049 point 3): a crash between
// the two writes leaves a new io.json beside an old pantin.json, which
// validation reports as unknown tags, and nothing is lost.
async function writeIoIfChanged(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
): Promise<void> {
  // The renames made since the last read are written with the document.
  alignIo(openPantin);
  const text = ioTextOf(openPantin.io);
  // A file migrated on read is written even when its text is unchanged: the
  // file on disk is still in the older version (ADR 0064 point 7).
  if (text !== null && (text !== openPantin.savedIoText || openPantin.ioFileIsOlder)) {
    await context.store.writeIoAtomically(pantinId, text);
    openPantin.savedIoText = text;
    openPantin.ioFileIsOlder = false;
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
    await writeIoIfChanged(context, pantinId, openPantin);
    await context.store.writeDocumentAtomically(pantinId, text);
    openPantin.savedText = text;
    openPantin.savedMeshPaths = openPantin.writingMeshPaths;
  } finally {
    openPantin.writingMeshPaths = new Set();
  }
  await deletePendingMeshes(context, pantinId, openPantin);
}

// Runs `task` after the saves and discards already queued for this Pantin.
export async function runQueued<Result>(
  openPantin: OpenPantin,
  task: () => Promise<Result>,
): Promise<Result> {
  const running = openPantin.saveQueue.then(task);
  // The queue continues after a failure; this caller still gets the error.
  openPantin.saveQueue = running.catch(() => undefined);
  return await running;
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
  const io = await readIoReading(context.store, pantinId);
  await waitForImports(openPantin);
  // From here to the reset, no await: no import can slip in between.
  const savedMeshPaths = meshPathsOf(saved);
  const candidates = [
    ...meshPathsOf(openPantin.document),
    ...openPantin.pendingMeshDeletions.keys(),
  ];
  const unsavedMeshes = new Set(candidates.filter((meshPath) => !savedMeshPaths.has(meshPath)));
  openPantin.document = saved;
  openPantin.savedText = serializePantinDocument(saved);
  openPantin.io = io;
  openPantin.ioAlignedDocument = saved;
  openPantin.savedIoText = ioTextOf(io);
  openPantin.ioFileIsOlder = isMigrated(io);
  openPantin.savedMeshPaths = savedMeshPaths;
  openPantin.pendingMeshDeletions.clear();
  resetRuntimeState(context, openPantin);
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
    (candidate) =>
      isBodyEndpoint(candidate.parent, bodyId) || isBodyEndpoint(candidate.child, bodyId),
  );
  if (joint !== undefined) {
    throw new ApiError(
      "conflict",
      `Body "${bodyId}" is used by joint "${joint.id}". Delete the joint first.`,
    );
  }
  refuseBodyUsedAsFrame(openPantin.document, bodyId, "be deleted");
  openPantin.document = removeBodies(openPantin.document, new Set([bodyId]));
  await releaseMesh(context, pantinId, openPantin, body.mesh);
  return toResponse(pantinId, openPantin);
}
