import { createHash } from "node:crypto";
import {
  IO_FILE_MAX_BYTES,
  IO_ZONES,
  type IoChannel,
  type IoDocument,
  IoDocumentSchema,
  type IoModule,
  type IoPath,
  type IoProblem,
} from "@pantin/protocol";

// io.json as the core reads, orders and writes it (ADR 0049 points 1 and 3):
// pure, the file is read by the caller. The canonical text is the one
// `unsavedChanges` compares, the one a save writes and the one `mappingId`
// hashes, so a hand formatted file is never "unsaved" by itself.

/** What the bytes of io.json make: nothing, a document, or the reasons it is unreadable. */
export type IoReading =
  | { kind: "missing" }
  | { kind: "document"; document: IoDocument }
  | { kind: "unreadable"; problems: IoProblem[] };

export const MISSING_IO: IoReading = { kind: "missing" };

function compareText(first: string, second: string): number {
  // Code units, not a locale: the order must be the same on every machine.
  return first < second ? -1 : first > second ? 1 : 0;
}

/** Zone (order of IO_ZONES), then address, then tag. */
function compareChannels(first: IoChannel, second: IoChannel): number {
  return (
    IO_ZONES.indexOf(first.zone) - IO_ZONES.indexOf(second.zone) ||
    first.address - second.address ||
    compareText(first.tag, second.tag)
  );
}

// Keys are listed one by one so that the text does not depend on how the
// object was built.
function orderedChannel(channel: IoChannel): IoChannel {
  return {
    tag: channel.tag,
    variable: channel.variable,
    zone: channel.zone,
    address: channel.address,
    ioType: channel.ioType,
    comment: channel.comment,
  };
}

function orderedModule(module: IoModule): IoModule {
  return {
    key: module.key,
    port: module.port,
    unitId: module.unitId,
    wordOrder: module.wordOrder,
    watchdogMilliseconds: module.watchdogMilliseconds,
    channels: module.channels.toSorted(compareChannels).map(orderedChannel),
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
  const result = IoDocumentSchema.safeParse(json);
  if (!result.success) {
    return {
      kind: "unreadable",
      problems: result.error.issues.map((issue) => ({
        path: pathOf(issue.path),
        code: "schema_invalid",
        message: issue.message,
      })),
    };
  }
  // Sorted here: validation paths index this order, while the schema_invalid
  // paths above index the raw file (matters to `pantin validate`, slice P3).
  return { kind: "document", document: canonicalIoDocument(result.data) };
}
