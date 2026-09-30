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

// Version 3 adds the helical joint type (ADR 0013): existing documents stay valid.
function migrateV2ToV3(document: JsonObject): JsonObject {
  return { ...document, schema_version: 3 };
}

// Version 4 adds assemblies and tag keys (ADR 0019 point 12): every body goes
// into one assembly "main", and each joint's tag key is its id, unique per
// Pantin hence per assembly. Grouping by import is not reliable (ADR 0019).
function migrateV3ToV4(document: JsonObject): JsonObject {
  const withField = (items: unknown, field: (item: JsonObject) => JsonObject) =>
    Array.isArray(items)
      ? items.map((item: unknown) => (isJsonObject(item) ? field(item) : item))
      : items;
  return {
    ...document,
    schema_version: 4,
    assemblies: [{ key: "main", name: "main" }],
    bodies: withField(document.bodies, (body) => ({ ...body, assembly: "main" })),
    joints: withField(document.joints, (joint) => ({ ...joint, tagKey: joint.id })),
  };
}

// Version 5 adds drives (ADR 0022): existing documents have none.
function migrateV4ToV5(document: JsonObject): JsonObject {
  return { ...document, schema_version: 5, drives: [] };
}

// Version 6 adds joint sensors (ADR 0023): existing documents have none.
function migrateV5ToV6(document: JsonObject): JsonObject {
  return { ...document, schema_version: 6, sensors: [] };
}

// Key: the version a step starts from.
const MIGRATION_STEPS: ReadonlyMap<number, (document: JsonObject) => JsonObject> = new Map([
  [1, migrateV1ToV2],
  [2, migrateV2ToV3],
  [3, migrateV3ToV4],
  [4, migrateV4ToV5],
  [5, migrateV5ToV6],
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
