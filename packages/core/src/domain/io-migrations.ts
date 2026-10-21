import { isJsonObject, type JsonObject } from "./json-object.ts";

// Migrations of io.json between schema versions (CLAUDE.md 11.2, ADR 0064
// point 7): one pure function per version step, applied on read before the
// schema. The migrated document is written in the current version on the next
// save. They work on raw JSON, so a file the schema will refuse still gets
// the same shape, and the problems point into the migrated text.

const MODBUS_KIND = "modbus_tcp_slave";
const MODULE_SETTING_FIELDS = ["port", "unitId", "wordOrder", "watchdogMilliseconds"] as const;
const CHANNEL_MODBUS_FIELDS = ["zone", "address", "ioType"] as const;

function pickFields(source: JsonObject, fields: readonly string[]): JsonObject {
  return Object.fromEntries(fields.filter((field) => field in source).map((f) => [f, source[f]]));
}

function omitFields(source: JsonObject, fields: readonly string[]): JsonObject {
  return Object.fromEntries(Object.entries(source).filter(([field]) => !fields.includes(field)));
}

// Version 1 channels have the Modbus fields at their top level.
function migrateChannelV1ToV2(channel: unknown): unknown {
  if (!isJsonObject(channel)) {
    return channel;
  }
  return {
    ...omitFields(channel, CHANNEL_MODBUS_FIELDS),
    modbus: pickFields(channel, CHANNEL_MODBUS_FIELDS),
  };
}

// Version 1 modules are all Modbus slaves, with their settings at the top level.
function migrateModuleV1ToV2(module: unknown): unknown {
  if (!isJsonObject(module)) {
    return module;
  }
  const channels = Array.isArray(module.channels)
    ? module.channels.map(migrateChannelV1ToV2)
    : module.channels;
  return {
    ...omitFields(module, [...MODULE_SETTING_FIELDS, "channels"]),
    transport: { kind: MODBUS_KIND, ...pickFields(module, MODULE_SETTING_FIELDS) },
    channels,
  };
}

/** Version 2 moves the settings into `transport` and the Modbus fields into `modbus`. */
export function migrateIoV1ToV2(document: JsonObject): JsonObject {
  return {
    ...document,
    schema_version: 2,
    modules: Array.isArray(document.modules)
      ? document.modules.map(migrateModuleV1ToV2)
      : document.modules,
  };
}

// Key: the version a step starts from.
const MIGRATION_STEPS: ReadonlyMap<number, (document: JsonObject) => JsonObject> = new Map([
  [1, migrateIoV1ToV2],
]);

export type IoMigrationResult = { document: JsonObject; migratedFrom: number | null };

/**
 * Applies the steps from the file's version to the current one. A file without
 * a numeric version, or with one no step starts from, is returned as it is: the
 * schema reports it.
 */
export function migrateIoJson(json: JsonObject, currentVersion: number): IoMigrationResult {
  let document = json;
  let version = typeof document.schema_version === "number" ? document.schema_version : null;
  const startedAt = version;
  while (version !== null && version < currentVersion) {
    const step = MIGRATION_STEPS.get(version);
    if (step === undefined) {
      break;
    }
    document = step(document);
    version += 1;
  }
  return { document, migratedFrom: startedAt !== null && version !== startedAt ? startedAt : null };
}
