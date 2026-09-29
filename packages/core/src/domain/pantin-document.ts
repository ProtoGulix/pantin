import {
  type Body,
  type Joint,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { migratePantinDocument } from "./migrations.ts";
import { formatIssues } from "./validation.ts";

// Pure edits of a Pantin document: each returns a new document.

export function createPantinDocument(name: string): PantinDocument {
  return { schema_version: PANTIN_SCHEMA_VERSION, name, bodies: [], joints: [] };
}

export function renamePantinDocument(document: PantinDocument, name: string): PantinDocument {
  return { ...document, name };
}

export function addBodies(document: PantinDocument, bodies: readonly Body[]): PantinDocument {
  return { ...document, bodies: [...document.bodies, ...bodies] };
}

export function removeBodies(
  document: PantinDocument,
  bodyIds: ReadonlySet<string>,
): PantinDocument {
  return { ...document, bodies: document.bodies.filter((body) => !bodyIds.has(body.id)) };
}

export function addJoint(document: PantinDocument, joint: Joint): PantinDocument {
  return { ...document, joints: [...document.joints, joint] };
}

// Keeps the joint at its place in the list, so pantin.json diffs stay small.
export function replaceJoint(document: PantinDocument, joint: Joint): PantinDocument {
  return {
    ...document,
    joints: document.joints.map((existing) => (existing.id === joint.id ? joint : existing)),
  };
}

export function removeJoint(document: PantinDocument, jointId: string): PantinDocument {
  return { ...document, joints: document.joints.filter((joint) => joint.id !== jointId) };
}

export function findBody(document: PantinDocument, bodyId: string): Body | undefined {
  return document.bodies.find((body) => body.id === bodyId);
}

// Only the display name changes: `source` keeps the original node names.
export function renameBody(document: PantinDocument, bodyId: string, name: string): PantinDocument {
  return {
    ...document,
    bodies: document.bodies.map((body) => (body.id === bodyId ? { ...body, name } : body)),
  };
}

// Stable text form written to pantin.json, also used to detect unsaved changes.
export function serializePantinDocument(document: PantinDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

// `location` names the file in error messages, so the user knows what to fix.
export function parsePantinDocument(text: string, location: string): PantinDocument {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ApiError("conflict", `${location} is not valid JSON (${reason}). Fix or restore it.`);
  }
  const result = PantinDocumentSchema.safeParse(migratePantinDocument(json, location));
  if (!result.success) {
    const issues = formatIssues(result.error.issues);
    throw new ApiError(
      "conflict",
      `${location} is not a valid Pantin: ${issues}. Fix or restore it.`,
    );
  }
  return result.data;
}
