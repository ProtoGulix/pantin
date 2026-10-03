import { OrphanMeshDeletionRequestSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route } from "./route-context.ts";

// Orphan mesh routes (ADR 0038); the contract is in orphan-mesh-api.ts.

const ORPHAN_MESHES = ["pantins", ":pantinId", "orphan-meshes"];

export const ORPHAN_MESH_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ORPHAN_MESHES,
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.listOrphanMeshes(pantinIdOf(context))),
  },
  {
    method: "POST",
    pattern: [...ORPHAN_MESHES, "delete"],
    handle: async (context) => {
      const { fileNames } = parseWithSchema(
        OrphanMeshDeletionRequestSchema,
        await readJsonBody(context.request),
        "The orphan deletion request",
      );
      const pantinId = pantinIdOf(context);
      sendJson(
        context.response,
        200,
        await context.service.deleteOrphanMeshes(pantinId, fileNames),
      );
    },
  },
];
