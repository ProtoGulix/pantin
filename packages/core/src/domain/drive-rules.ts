import {
  type CreateDriveRequest,
  type Drive,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { keyTaken, tagKeyOwners } from "./tag-keys.ts";
import { parseWithSchema } from "./validation.ts";

// Adding and changing drives in a document (ADR 0022), as pure functions.
// The document schema checks the rest: known joints and assembly, one drive
// per joint, one unit per drive.

function validatedDrive(document: PantinDocument, id: string, context: string) {
  const updated = parseWithSchema(PantinDocumentSchema, document, context);
  const stored = updated.drives.find((candidate) => candidate.id === id);
  if (stored === undefined) {
    throw new Error(`Drive "${id}" vanished while validating the document.`);
  }
  return { document: updated, drive: stored };
}

function findDrive(document: PantinDocument, driveId: string): Drive {
  const drive = document.drives.find((candidate) => candidate.id === driveId);
  if (drive === undefined) {
    throw new ApiError("not_found", `This Pantin has no drive "${driveId}".`);
  }
  return drive;
}

function withDrive(document: PantinDocument, drive: Drive): PantinDocument {
  const exists = document.drives.some((candidate) => candidate.id === drive.id);
  const drives = exists
    ? document.drives.map((candidate) => (candidate.id === drive.id ? drive : candidate))
    : [...document.drives, drive];
  return { ...document, drives };
}

/** Its id and tag key come from its name, unique among drives and tag owners. */
export function addDriveToDocument(document: PantinDocument, request: CreateDriveRequest) {
  const baseKey = slugifyDisplayName(request.name, "drive");
  const id = makeUniqueId(baseKey, new Set(document.drives.map((drive) => drive.id)));
  const tagKey = makeUniqueId(baseKey, new Set(tagKeyOwners(document, request.assembly).keys()));
  return validatedDrive(withDrive(document, { id, tagKey, ...request }), id, "The new drive");
}

// Every field but the id and the tag key may change, the type included; in
// another assembly the tag key must be free (no automatic suffix, ADR 0019).
export function updateDriveInDocument(
  document: PantinDocument,
  driveId: string,
  request: CreateDriveRequest,
) {
  const existing = findDrive(document, driveId);
  const owner = tagKeyOwners(document, request.assembly, { driveId }).get(existing.tagKey);
  if (owner !== undefined) {
    throw new ApiError(
      "conflict",
      `Tag key "${existing.tagKey}" of drive "${driveId}" is already used by ${owner} in assembly "${request.assembly}". Rename one of the tag keys first.`,
    );
  }
  const drive = { id: driveId, tagKey: existing.tagKey, ...request };
  return validatedDrive(withDrive(document, drive), driveId, "The changed drive");
}

export function deleteDriveFromDocument(document: PantinDocument, driveId: string) {
  findDrive(document, driveId);
  return { ...document, drives: document.drives.filter((drive) => drive.id !== driveId) };
}

export function renameDriveTagKey(document: PantinDocument, driveId: string, tagKey: string) {
  const drive = findDrive(document, driveId);
  const taken = tagKeyOwners(document, drive.assembly, { driveId });
  const owner = taken.get(tagKey);
  if (owner !== undefined) {
    const takenKeys = new Set([...taken.keys(), drive.tagKey]);
    throw keyTaken(tagKey, `${owner} in assembly "${drive.assembly}"`, takenKeys);
  }
  return withDrive(document, { ...drive, tagKey });
}
