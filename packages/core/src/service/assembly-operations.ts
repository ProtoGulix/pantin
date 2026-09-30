import {
  type PantinDocument,
  PantinDocumentSchema,
  type PantinId,
  type PantinResponse,
  type RenamedTagsResponse,
} from "@pantin/protocol";
import {
  createAssembly,
  deleteAssembly,
  moveBody,
  renameAssembly,
  renameAssemblyKey,
  renameTagKey,
} from "../domain/assembly-edits.ts";
import { renamedTags } from "../domain/tags.ts";
import { parseWithSchema } from "../domain/validation.ts";
import { waitForImports } from "./mesh-lifecycle.ts";
import { loadPantin, type ServiceContext, toResponse } from "./open-pantins.ts";

// Assemblies and keys of an open Pantin (ADR 0019). Runtime state is keyed by
// joint id, so it survives every key change here.

type Edit = (document: PantinDocument) => PantinDocument;

async function applyEdit(context: ServiceContext, pantinId: PantinId, edit: Edit) {
  const openPantin = await loadPantin(context, pantinId);
  // An import in flight rolls back its assembly by key: let it settle first.
  await waitForImports(openPantin);
  const before = openPantin.document;
  openPantin.document = parseWithSchema(PantinDocumentSchema, edit(before), "The changed Pantin");
  return { before, after: openPantin.document, response: toResponse(pantinId, openPantin) };
}

async function editPantin(
  context: ServiceContext,
  pantinId: PantinId,
  edit: Edit,
): Promise<PantinResponse> {
  return (await applyEdit(context, pantinId, edit)).response;
}

// For the edits that may rename tags: the answer lists them.
async function editWithTags(
  context: ServiceContext,
  pantinId: PantinId,
  edit: Edit,
): Promise<RenamedTagsResponse> {
  const { before, after, response } = await applyEdit(context, pantinId, edit);
  return { pantin: response, renamedTags: renamedTags(before, after) };
}

export function assemblyOperations(context: ServiceContext) {
  return {
    createAssembly: (pantinId: PantinId, name: string) =>
      editPantin(context, pantinId, (document) => createAssembly(document, name).document),
    renameAssembly: (pantinId: PantinId, key: string, name: string) =>
      editPantin(context, pantinId, (document) => renameAssembly(document, key, name)),
    deleteAssembly: (pantinId: PantinId, key: string) =>
      editPantin(context, pantinId, (document) => deleteAssembly(document, key)),
    renameAssemblyKey: (pantinId: PantinId, key: string, newKey: string) =>
      editWithTags(context, pantinId, (document) => renameAssemblyKey(document, key, newKey)),
    renameTagKey: (pantinId: PantinId, jointId: string, tagKey: string) =>
      editWithTags(context, pantinId, (document) => renameTagKey(document, jointId, tagKey)),
    moveBody: (pantinId: PantinId, bodyId: string, assembly: string) =>
      editWithTags(context, pantinId, (document) => moveBody(document, bodyId, assembly)),
  };
}
