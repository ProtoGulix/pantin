import type {
  OrphanMeshDeletionResponse,
  OrphanMeshFile,
  OrphanMeshList,
  PantinId,
} from "@pantin/protocol";
import {
  findOrphanMeshFiles,
  isOrphanCandidate,
  keptMeshFileNames,
} from "../domain/orphan-meshes.ts";
import { loadSettledPantin, meshPathsToKeep, runQueued, waitForImports } from "./mesh-lifecycle.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";

// Cleaning orphan mesh files (ADR 0038). The document is never changed.

// The keep set is read after the listing: an import that reserved its bodies
// meanwhile already uses its files (ADR 0038, Context).
async function findOrphans(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
): Promise<OrphanMeshList> {
  const files = await context.store.listMeshFolderFiles(pantinId);
  return findOrphanMeshFiles(files, meshPathsToKeep(openPantin));
}

/** The dry run: what a deletion would remove now. */
async function listOrphanMeshes(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<OrphanMeshList> {
  return findOrphans(context, pantinId, await loadSettledPantin(context, pantinId));
}

// The Node.js code, never the message: a message may contain an absolute path.
function errorCodeOf(error: unknown): string {
  const code: unknown = error instanceof Error ? Reflect.get(error, "code") : undefined;
  return typeof code === "string" ? code : "unknown";
}

async function deleteOrphans(
  context: ServiceContext,
  pantinId: PantinId,
  openPantin: OpenPantin,
  fileNames: readonly string[],
): Promise<OrphanMeshDeletionResponse> {
  await waitForImports(openPantin);
  const orphans = new Map<string, OrphanMeshFile>(
    (await findOrphans(context, pantinId, openPantin)).files.map((file) => [file.fileName, file]),
  );
  const response: OrphanMeshDeletionResponse = { deleted: [], skipped: [], failed: [] };
  for (const fileName of new Set(fileNames)) {
    const orphan = orphans.get(fileName);
    if (orphan === undefined) {
      response.skipped.push(fileName);
      continue;
    }
    try {
      // The store checks the folders first, then asks this rule with no await
      // before the unlink: a file used since the listing is never deleted.
      const outcome = await context.store.deleteMeshFolderFile(pantinId, fileName, () =>
        isOrphanCandidate(fileName, keptMeshFileNames(meshPathsToKeep(openPantin))),
      );
      if (outcome === "deleted") {
        response.deleted.push(orphan);
      } else {
        response.skipped.push(fileName);
      }
    } catch (error) {
      response.failed.push({ fileName, errorCode: errorCodeOf(error) });
    }
  }
  return response;
}

/** Deletes the requested names that are still orphans; the others are skipped. */
async function deleteOrphanMeshes(
  context: ServiceContext,
  pantinId: PantinId,
  fileNames: readonly string[],
): Promise<OrphanMeshDeletionResponse> {
  const openPantin = await loadPantin(context, pantinId);
  return runQueued(openPantin, () => deleteOrphans(context, pantinId, openPantin, fileNames));
}

export function orphanMeshOperations(context: ServiceContext) {
  return {
    listOrphanMeshes: (pantinId: PantinId) => listOrphanMeshes(context, pantinId),
    deleteOrphanMeshes: (pantinId: PantinId, fileNames: readonly string[]) =>
      deleteOrphanMeshes(context, pantinId, fileNames),
  };
}
