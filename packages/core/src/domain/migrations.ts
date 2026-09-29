import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { ApiError } from "../errors.ts";

// Migrations of pantin.json between schema versions (CLAUDE.md 11.2,
// ADR 0011 point 6): one pure function per version step, applied on read.
// The migrated document is written in the current version on the next save.

type JsonObject = Record<string, unknown>;

// Version 2 adds kinematic joints (ADR 0011).
function migrateV1ToV2(document: JsonObject): JsonObject {
  return { ...document, schema_version: 2, joints: [] };
}

// Key: the version a step starts from.
const MIGRATION_STEPS: ReadonlyMap<number, (document: JsonObject) => JsonObject> = new Map([
  [1, migrateV1ToV2],
]);

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Brings a parsed pantin.json to the current version; validation comes after.
export function migratePantinDocument(json: unknown, location: string): unknown {
  if (!isJsonObject(json) || !Number.isInteger(json.schema_version)) {
    // Left to the schema, which explains what is missing.
    return json;
  }
  let document = json;
  let version = Number(document.schema_version);
  if (version > PANTIN_SCHEMA_VERSION) {
    throw new ApiError(
      "conflict",
      `${location} has schema_version ${version}, newer than this core supports (${PANTIN_SCHEMA_VERSION}). Update Pantin.`,
    );
  }
  while (version < PANTIN_SCHEMA_VERSION) {
    const step = MIGRATION_STEPS.get(version);
    if (step === undefined) {
      throw new ApiError(
        "conflict",
        `${location} has schema_version ${version}, which no migration handles. Restore a supported file.`,
      );
    }
    document = step(document);
    version = Number(document.schema_version);
  }
  return document;
}
