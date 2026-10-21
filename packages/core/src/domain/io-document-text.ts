import { createHash } from "node:crypto";
import {
  IO_FILE_MAX_BYTES,
  IO_SCHEMA_VERSION,
  type IoChannel,
  type IoDocument,
  IoDocumentSchema,
  type IoModule,
  type IoPath,
  type IoProblem,
} from "@pantin/protocol";
import { migrateIoJson } from "./io-migrations.ts";
import { rulesOf } from "./io-transports.ts";
import { isJsonObject } from "./json-object.ts";

// io.json as the core reads, orders and writes it (ADR 0049 points 1 and 3,
// ADR 0064 points 4 and 7):
// pure, the file is read by the caller. The canonical text is the one
// `unsavedChanges` compares, the one a save writes and the one `mappingId`
// hashes, so a hand formatted file is never "unsaved" by itself.

/** What the bytes of io.json make: nothing, a document, or the reasons it is unreadable. */
export type IoReading =
  | { kind: "missing" }
  // `migratedFrom` is the version the file was written in when it was migrated on read.
  | { kind: "document"; document: IoDocument; migratedFrom?: number }
  | { kind: "unreadable"; problems: IoProblem[] };

export const MISSING_IO: IoReading = { kind: "missing" };

// Keys are listed one by one so that the text does not depend on how the
// object was built: the common fields, then the transport's own.
function orderedChannel(module: IoModule, channel: IoChannel): IoChannel {
  return {
    tag: channel.tag,
    variable: channel.variable,
    comment: channel.comment,
    ...rulesOf(module.transport).orderedChannelFields(channel),
  };
}

function orderedModule(module: IoModule): IoModule {
  const rules = rulesOf(module.transport);
  return {
    key: module.key,
    transport: rules.orderedTransport(module.transport),
    channels: module.channels
      .toSorted(rules.compareChannels)
      .map((channel) => orderedChannel(module, channel)),
  };
}

/** The same mapping with its channels in canonical order. Modules keep the file order. */
export function canonicalIoDocument(document: IoDocument): IoDocument {
  return { schema_version: document.schema_version, modules: document.modules.map(orderedModule) };
}

/** The text io.json has after a save: 2-space indentation and a final newline. */
export function serializeIoDocument(document: IoDocument): string {
  return `${JSON.stringify(canonicalIoDocument(document), null, 2)}\n`;
}

/** The canonical text of a reading; null when there is no usable mapping. */
export function ioTextOf(reading: IoReading): string | null {
  return reading.kind === "document" ? serializeIoDocument(reading.document) : null;
}

const hashes = new WeakMap<IoDocument, string>();

/**
 * SHA-256 (hex) of the canonical text; null when the mapping is missing or
 * unreadable. Memoised by document object: the bus asks on every tick, and
 * an edit replaces the document, as it does for pantin.json.
 */
export function mappingIdOf(reading: IoReading): string | null {
  if (reading.kind !== "document") {
    return null;
  }
  let id = hashes.get(reading.document);
  if (id === undefined) {
    id = createHash("sha256").update(serializeIoDocument(reading.document)).digest("hex");
    hashes.set(reading.document, id);
  }
  return id;
}

/** A read that threw (link outside the folder, directory, permissions) must not block pantin.json. */
export function unreadableFile(reason: string): IoReading {
  return unreadable(
    "unreadable_file",
    `io.json cannot be read (${reason}): fix or remove it, then discard.`,
  );
}

function unreadable(code: IoProblem["code"], message: string, path: IoPath = []): IoReading {
  return { kind: "unreadable", problems: [{ path, code, message }] };
}

// A Zod path can hold symbols; none comes from a schema of strings and numbers,
// but the type allows it.
function pathOf(issuePath: readonly PropertyKey[]): IoPath {
  return issuePath.map((part) => (typeof part === "number" ? part : String(part)));
}

/**
 * Decodes and checks the bytes of io.json (at most IO_FILE_MAX_BYTES + 1 of
 * them, so that a larger file is recognisable); undefined when it is missing.
 * Structural rules belong to the schema: a file that fails them is unreadable,
 * with one problem per Zod issue (ADR 0049 point 6).
 */
export function readIoDocument(bytes: Uint8Array | undefined): IoReading {
  if (bytes === undefined) {
    return MISSING_IO;
  }
  if (bytes.byteLength > IO_FILE_MAX_BYTES) {
    return unreadable("file_too_large", `io.json is larger than ${IO_FILE_MAX_BYTES} bytes.`);
  }
  let text: string;
  try {
    // A UTF-8 byte order mark is skipped (TextDecoder default): editors add it.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return unreadable("invalid_encoding", "io.json is not valid UTF-8.");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return unreadable("invalid_json", `io.json is not valid JSON (${reason}).`);
  }
  return readParsedJson(json);
}

// A file written by a newer Pantin is refused by name, not as a puzzling schema error.
function newerVersionOf(json: unknown): number | null {
  const version = isJsonObject(json) ? json.schema_version : undefined;
  return typeof version === "number" && version > IO_SCHEMA_VERSION ? version : null;
}

function readParsedJson(json: unknown): IoReading {
  const newer = newerVersionOf(json);
  if (newer !== null) {
    return unreadable(
      "newer_schema_version",
      `io.json is in version ${newer}, written by a newer Pantin: this one reads up to version ${IO_SCHEMA_VERSION}. Update Pantin.`,
    );
  }
  // The chain runs before the schema, so the problems of an old file point into the migrated shape.
  const migration = isJsonObject(json)
    ? migrateIoJson(json, IO_SCHEMA_VERSION)
    : { document: json, migratedFrom: null };
  const result = IoDocumentSchema.safeParse(migration.document);
  const note = migration.migratedFrom === null ? "" : migratedNote(migration.migratedFrom);
  if (!result.success) {
    return {
      kind: "unreadable",
      problems: result.error.issues.map((issue) => ({
        path: pathOf(issue.path),
        code: "schema_invalid",
        message: issue.message + note,
      })),
    };
  }
  // Sorted here: validation paths index this order, while the schema_invalid
  // paths above index the raw file (matters to `pantin validate`, slice P3).
  const document = canonicalIoDocument(result.data);
  return migration.migratedFrom === null
    ? { kind: "document", document }
    : { kind: "document", document, migratedFrom: migration.migratedFrom };
}

function migratedNote(version: number): string {
  return ` (the path is in the file as migrated from version ${version})`;
}
