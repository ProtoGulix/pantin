import type { Body, PantinId } from "@pantin/protocol";
import { findBody, renameBody } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { MeshFile } from "../store/pantin-store.ts";
import { loadPantin, type ServiceContext, updateDocument } from "./open-pantins.ts";

// Body operations of a Pantin: rename, mesh access.

export async function renameBodyOf(
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
export async function openBodyMesh(
  context: ServiceContext,
  pantinId: PantinId,
  meshPath: string,
): Promise<MeshFile> {
  const { document } = await loadPantin(context, pantinId);
  const body = document.bodies.find((candidate) => candidate.mesh === meshPath);
  if (body === undefined) {
    throw new ApiError("not_found", `Pantin "${pantinId}" has no mesh "${meshPath}".`);
  }
  return context.store.openMesh(pantinId, body.mesh);
}
