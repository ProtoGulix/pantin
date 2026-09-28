import type { Body, ImportBodyQuery, PantinId } from "@pantin/protocol";
import { fileNameStem } from "../domain/ids.ts";
import { buildImportedBody } from "../domain/import-body.ts";
import { addBody, findBody, removeBody, renameBody } from "../domain/pantin-document.ts";
import { ApiError } from "../errors.ts";
import type { MeshFile } from "../store/pantin-store.ts";
import { loadPantin, type ServiceContext, updateDocument } from "./open-pantins.ts";

// Body operations of a Pantin: import, rename, mesh access.

export async function importBody(
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
): Promise<{ file: MeshFile; format: Body["source"]["format"] }> {
  const { document } = await loadPantin(context, pantinId);
  const body = document.bodies.find((candidate) => candidate.mesh === meshPath);
  if (body === undefined) {
    throw new ApiError("not_found", `Pantin "${pantinId}" has no mesh "${meshPath}".`);
  }
  return { file: await context.store.openMesh(pantinId, body.mesh), format: body.source.format };
}
