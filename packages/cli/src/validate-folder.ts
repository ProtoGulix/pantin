import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  ApiError,
  assertRealPathInside,
  type DocumentReading,
  isErrorWithCode,
  readPantinDocument,
  resolveInside,
} from "@pantin/core";
import { type Body, PANTIN_DOCUMENT_FILE_NAME, type PantinDocument } from "@pantin/protocol";
import { CANONICAL_ORDER_NOTE, describeIoProblem, readFolderIo } from "./io-folder.ts";

// Checks a Pantin folder without a running core (ADR 0021): its pantin.json
// through the core's reader (migration, then every document rule), then the
// mesh file of every body. Reads only: a migrated document is reported, never
// written back.

export interface FolderReport {
  // One actionable sentence per problem; empty when the folder is valid.
  problems: string[];
  // Facts worth knowing that are not problems (a migration on read).
  notes: string[];
}

async function readDocumentText(path: string): Promise<string | ApiError> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return new ApiError("not_found", `Cannot read ${path} (${reason}). Is this a Pantin folder?`);
  }
}

// The same checks as the core's store: the path stays inside the folder,
// even through symbolic links, and names a regular file.
async function meshProblem(folder: string, body: Body): Promise<string | null> {
  const where = `Body "${body.id}": mesh "${body.mesh}"`;
  try {
    const path = resolveInside(folder, body.mesh);
    await assertRealPathInside(folder, path);
    return (await stat(path)).isFile() ? null : `${where} is not a file.`;
  } catch (error) {
    if (error instanceof ApiError) {
      return `${where}: ${error.message}`;
    }
    if (isErrorWithCode(error, "ENOENT")) {
      return `${where} is missing from the folder.`;
    }
    const reason = error instanceof Error ? error.message : String(error);
    return `${where} cannot be read (${reason}).`;
  }
}

async function meshProblems(folder: string, document: PantinDocument): Promise<string[]> {
  const problems = await Promise.all(document.bodies.map((body) => meshProblem(folder, body)));
  return problems.filter((problem) => problem !== null);
}

function readingOf(text: string, location: string): DocumentReading | ApiError {
  try {
    return readPantinDocument(text, location);
  } catch (error) {
    // A version newer than this Pantin, or one no migration handles.
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
}

export type FolderDocument = { document: PantinDocument; notes: string[] } | { problems: string[] };

/** The folder's pantin.json through the core's reader, or why it cannot be used. */
export async function readFolderDocument(folder: string): Promise<FolderDocument> {
  const location = join(folder, PANTIN_DOCUMENT_FILE_NAME);
  const text = await readDocumentText(location);
  if (text instanceof ApiError) {
    return { problems: [text.message] };
  }
  const reading = readingOf(text, location);
  if (reading instanceof ApiError) {
    return { problems: [reading.message] };
  }
  if (reading.kind === "invalidJson") {
    return { problems: [`${location} is not valid JSON (${reading.reason}).`] };
  }
  if (reading.kind === "invalid") {
    return { problems: reading.problems };
  }
  const notes =
    reading.migratedFrom === null
      ? []
      : [`Schema version ${reading.migratedFrom} on disk: the core migrates it on open.`];
  return { document: reading.document, notes };
}

// io.json, when the folder has it (ADR 0049 point 9). Problems print as
// "io.json: modules[0].channels[3].address: message".
async function ioReport(folder: string, document: PantinDocument): Promise<FolderReport> {
  const { answer, canonical } = await readFolderIo(folder, document);
  if (answer.status === "missing") {
    return { problems: [], notes: [] };
  }
  const unmapped = answer.unmappedTags.map((tag) => tag.name);
  const notes = [
    ...(unmapped.length === 0
      ? []
      : [
          `${unmapped.length} tag(s) not mapped in io.json: ${unmapped.slice(0, 5).join(", ")}${unmapped.length > 5 ? ", ..." : ""}.`,
        ]),
    ...(canonical || answer.problems.length === 0 ? [] : [CANONICAL_ORDER_NOTE]),
  ];
  return { problems: answer.problems.map(describeIoProblem), notes };
}

export async function validatePantinFolder(folder: string): Promise<FolderReport> {
  const read = await readFolderDocument(folder);
  if ("problems" in read) {
    return { problems: read.problems, notes: [] };
  }
  const io = await ioReport(folder, read.document);
  return {
    problems: [...(await meshProblems(folder, read.document)), ...io.problems],
    notes: [...read.notes, ...io.notes],
  };
}
