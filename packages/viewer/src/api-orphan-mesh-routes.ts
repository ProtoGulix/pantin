import {
  type MeshFolderFileName,
  type OrphanMeshDeletionRequest,
  OrphanMeshDeletionRequestSchema,
  type OrphanMeshDeletionResponse,
  OrphanMeshDeletionResponseSchema,
  type OrphanMeshList,
  OrphanMeshListSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// Orphan mesh files of the API client (ADR 0038). The deletion takes at most
// MAX_ORPHAN_DELETIONS_PER_REQUEST names: the caller sends batches.

export interface OrphanMeshRoutes {
  // The dry run: the files of meshes/ that no body uses, with their sizes.
  listOrphanMeshes(pantinId: string): Promise<OrphanMeshList>;
  // The core deletes only the names that are still orphans; each file has its own outcome.
  deleteOrphanMeshes(
    pantinId: string,
    fileNames: readonly MeshFolderFileName[],
  ): Promise<OrphanMeshDeletionResponse>;
}

export function orphanMeshRoutes(send: SendJson): OrphanMeshRoutes {
  return {
    listOrphanMeshes: (pantinId) =>
      send(pantinUrl(pantinId, "/orphan-meshes"), jsonRequest("GET"), OrphanMeshListSchema),
    deleteOrphanMeshes: async (pantinId, fileNames) => {
      const request: OrphanMeshDeletionRequest = validInputOrThrow(
        OrphanMeshDeletionRequestSchema,
        { fileNames },
      );
      return send(
        pantinUrl(pantinId, "/orphan-meshes/delete"),
        jsonRequest("POST", request),
        OrphanMeshDeletionResponseSchema,
      );
    },
  };
}
