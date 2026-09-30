import {
  type Assembly,
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
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name,
    assemblies: [],
    bodies: [],
    joints: [],
    drives: [],
  };
}

export function renamePantinDocument(document: PantinDocument, name: string): PantinDocument {
  return { ...document, name };
}

export function addAssembly(document: PantinDocument, assembly: Assembly): PantinDocument {
  return { ...document, assemblies: [...document.assemblies, assembly] };
}

export function removeAssembly(document: PantinDocument, key: string): PantinDocument {
  return {
    ...document,
    assemblies: document.assemblies.filter((assembly) => assembly.key !== key),
  };
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

export function removeJoints(
  document: PantinDocument,
  jointIds: ReadonlySet<string>,
): PantinDocument {
  return { ...document, joints: document.joints.filter((joint) => !jointIds.has(joint.id)) };
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
export type DocumentReading =
  // migratedFrom: the version on disk when older than the current one.
  | { kind: "valid"; document: PantinDocument; migratedFrom: number | null }
  | { kind: "invalidJson"; reason: string }
  // One sentence per broken rule, prefixed by where it is.
  | { kind: "invalid"; problems: string[] };

function versionOf(json: unknown): number | null {
  const version: unknown =
    typeof json === "object" && json !== null ? Reflect.get(json, "schema_version") : undefined;
  return typeof version === "number" && version < PANTIN_SCHEMA_VERSION ? version : null;
}

// Reads a pantin.json text: migration, then validation. A version newer than
// the core, or one no migration handles, throws an actionable ApiError.
export function readPantinDocument(text: string, location: string): DocumentReading {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { kind: "invalidJson", reason: error instanceof Error ? error.message : String(error) };
  }
  const result = PantinDocumentSchema.safeParse(migratePantinDocument(json, location));
  if (!result.success) {
    return { kind: "invalid", problems: result.error.issues.map((issue) => formatIssues([issue])) };
  }
  return { kind: "valid", document: result.data, migratedFrom: versionOf(json) };
}

export function parsePantinDocument(text: string, location: string): PantinDocument {
  const reading = readPantinDocument(text, location);
  if (reading.kind === "invalidJson") {
    throw new ApiError(
      "conflict",
      `${location} is not valid JSON (${reading.reason}). Fix or restore it.`,
    );
  }
  if (reading.kind === "invalid") {
    const issues = reading.problems.join("; ");
    throw new ApiError(
      "conflict",
      `${location} is not a valid Pantin: ${issues}. Fix or restore it.`,
    );
  }
  return reading.document;
}
