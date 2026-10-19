import {
  type AssemblyPlacementResponse,
  type MoveBodyResponse,
  type PantinDocument,
  PantinDocumentSchema,
  type PantinId,
  type PantinResponse,
  type Placement,
  type RenamedTagsResponse,
} from "@pantin/protocol";
import { anchorOfAssembly } from "../domain/assembly-anchors.ts";
import {
  createAssembly,
  deleteAssembly,
  renameAssembly,
  renameAssemblyKey,
  renameTagKey,
  setAssemblyParent,
  setAssemblyPlacement,
} from "../domain/assembly-edits.ts";
import { moveBody } from "../domain/move-body.ts";
import { renamedTags } from "../domain/tags.ts";
import { parseWithSchema } from "../domain/validation.ts";
import { deleteAssemblyWithContentsOf, previewAssemblyDeletion } from "./assembly-deletion.ts";
import { forgetJointRuntimeState } from "./joint-operations.ts";
import { waitForImports } from "./mesh-lifecycle.ts";
import { loadPantin, type ServiceContext, toResponse } from "./open-pantins.ts";

// Assemblies and keys of an open Pantin (ADR 0019). Runtime state is keyed by
// joint id, so it survives every key change here.

type Edit = (document: PantinDocument) => PantinDocument;

// An edit that answers more than the document (the group it made, the joints
// it deleted): `outcome` carries that, `document` is the one to store.
export async function applyOutcomeEdit<Outcome extends { document: PantinDocument }>(
  context: ServiceContext,
  pantinId: PantinId,
  edit: (document: PantinDocument) => Outcome,
) {
  const openPantin = await loadPantin(context, pantinId);
  // An import in flight rolls back its assembly by key: let it settle first.
  await waitForImports(openPantin);
  const before = openPantin.document;
  const outcome = edit(before);
  openPantin.document = parseWithSchema(
    PantinDocumentSchema,
    outcome.document,
    "The changed Pantin",
  );
  return {
    outcome,
    openPantin,
    before,
    after: openPantin.document,
    response: toResponse(pantinId, openPantin),
  };
}

async function applyEdit(context: ServiceContext, pantinId: PantinId, edit: Edit) {
  const { before, after, response } = await applyOutcomeEdit(context, pantinId, (document) => ({
    document: edit(document),
  }));
  return { before, after, response };
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

async function moveBodyOf(
  context: ServiceContext,
  pantinId: PantinId,
  bodyId: string,
  assembly: string,
): Promise<MoveBodyResponse> {
  const { outcome, openPantin, before, after, response } = await applyOutcomeEdit(
    context,
    pantinId,
    (document) => moveBody(document, bodyId, assembly),
  );
  for (const { id } of outcome.deletedJoints) {
    forgetJointRuntimeState(openPantin, id);
  }
  return {
    pantin: response,
    deletedJoints: outcome.deletedJoints.map(({ id, name }) => ({ id, name })),
    renamedTags: renamedTags(before, after),
  };
}

async function placeAssembly(
  context: ServiceContext,
  pantinId: PantinId,
  key: string,
  placement: Placement,
): Promise<AssemblyPlacementResponse> {
  const { after } = await applyEdit(context, pantinId, (document) =>
    setAssemblyPlacement(document, key, placement),
  );
  const stored = after.assemblies.find((assembly) => assembly.key === key);
  const anchor = anchorOfAssembly(after, key);
  return {
    placement: stored?.placement ?? placement,
    anchor: anchor === undefined ? { kind: "world" } : { kind: "assembly", key: anchor },
  };
}

export function assemblyOperations(context: ServiceContext) {
  return {
    createAssembly: (pantinId: PantinId, name: string, parent?: string) =>
      editPantin(context, pantinId, (document) => createAssembly(document, name, parent).document),
    setAssemblyParent: (pantinId: PantinId, key: string, parent: string | null) =>
      editPantin(context, pantinId, (document) => setAssemblyParent(document, key, parent)),
    renameAssembly: (pantinId: PantinId, key: string, name: string) =>
      editPantin(context, pantinId, (document) => renameAssembly(document, key, name)),
    deleteAssembly: (pantinId: PantinId, key: string) =>
      editPantin(context, pantinId, (document) => deleteAssembly(document, key)),
    previewAssemblyDeletion: (pantinId: PantinId, key: string) =>
      previewAssemblyDeletion(context, pantinId, key),
    deleteAssemblyWithContents: (pantinId: PantinId, key: string) =>
      deleteAssemblyWithContentsOf(context, pantinId, key),
    renameAssemblyKey: (pantinId: PantinId, key: string, newKey: string) =>
      editWithTags(context, pantinId, (document) => renameAssemblyKey(document, key, newKey)),
    renameTagKey: (pantinId: PantinId, jointId: string, tagKey: string) =>
      editWithTags(context, pantinId, (document) => renameTagKey(document, jointId, tagKey)),
    setAssemblyPlacement: (pantinId: PantinId, key: string, placement: Placement) =>
      placeAssembly(context, pantinId, key, placement),
    moveBody: (pantinId: PantinId, bodyId: string, assembly: string) =>
      moveBodyOf(context, pantinId, bodyId, assembly),
  };
}
