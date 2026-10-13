import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  decodeIoList,
  type IoListRow,
  ioTagsOf,
  ioWidthOf,
  parseIoList,
  readIoModules,
} from "@pantin/core";
import {
  IO_FILE_MAX_BYTES,
  IO_LIST_FILE_NAME,
  IO_LIST_HEADER,
  IO_MODULES_FILE_NAME,
  type IoModulesFile,
  type IoZone,
} from "@pantin/protocol";
import { readIoFiles } from "./io-folder.ts";
import { INIT_MODULE_KEY, INIT_MODULES_FILE, initRows, type NextAddresses } from "./io-init.ts";
import { readFolderDocument } from "./validate-folder.ts";

// `pantin io init <folder> [--update]` (ADR 0045 point 9). Without --update it
// refuses to touch existing files. With it, io.csv only ever grows: the rows
// of unmapped tags are appended and the existing bytes are never rewritten.

export type InitResult = { exitCode: number; messages: string[]; errors: string[] };

const REFUSED = (errors: string[]): InitResult => ({ exitCode: 1, messages: [], errors });

function modulesText(file: IoModulesFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

// The first free address per zone of module m1, past every row already there.
function usedAddresses(rows: readonly IoListRow[]): NextAddresses {
  const used = new Map<IoZone, number>();
  for (const row of rows.filter((candidate) => candidate.module === INIT_MODULE_KEY)) {
    used.set(row.zone, Math.max(used.get(row.zone) ?? 0, row.address + ioWidthOf(row.ioType)));
  }
  return used;
}

function modulesProblem(bytes: Uint8Array): string | null {
  const reading = readIoModules(bytes);
  if (reading.modules === null) {
    const first = reading.problems[0]?.message ?? "it is invalid";
    return `${IO_MODULES_FILE_NAME} cannot be used (${first}): fix it first.`;
  }
  return reading.modules.modules.some((module) => module.key === INIT_MODULE_KEY)
    ? null
    : `${IO_MODULES_FILE_NAME} has no module "${INIT_MODULE_KEY}", where new rows go: add it first.`;
}

async function createFiles(folder: string, rows: string[], withModules: boolean): Promise<void> {
  if (withModules) {
    await writeFile(join(folder, IO_MODULES_FILE_NAME), modulesText(INIT_MODULES_FILE), {
      flag: "wx",
    });
  }
  const text = [IO_LIST_HEADER, ...rows].map((line) => `${line}\n`).join("");
  await writeFile(join(folder, IO_LIST_FILE_NAME), text, { flag: "wx" });
}

async function appendRows(folder: string, existing: string, rows: string[]): Promise<void> {
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const lead = existing === "" || existing.endsWith("\n") ? "" : eol;
  await appendFile(join(folder, IO_LIST_FILE_NAME), lead + rows.map((row) => row + eol).join(""));
}

export async function ioInit(folder: string, update: boolean): Promise<InitResult> {
  const read = await readFolderDocument(folder);
  if ("problems" in read) {
    return REFUSED(read.problems);
  }
  const tags = ioTagsOf(read.document);
  const files = await readIoFiles(folder);
  if (!update && (files.csv !== undefined || files.modules !== undefined)) {
    return REFUSED([
      `${IO_LIST_FILE_NAME} or ${IO_MODULES_FILE_NAME} already exists in ${folder}: they belong to you. Use --update to append rows for unmapped tags.`,
    ]);
  }
  if (files.modules !== undefined) {
    const problem = modulesProblem(files.modules);
    if (problem !== null) {
      return REFUSED([problem]);
    }
  }
  if (files.csv === undefined) {
    await createFiles(folder, initRows(tags), files.modules === undefined);
    return {
      exitCode: 0,
      messages: [`Wrote ${IO_LIST_FILE_NAME} (${tags.length} rows).`],
      errors: [],
    };
  }
  return updateExisting(folder, files.csv, files.modules === undefined, tags);
}

type ExistingList = { text: string; rows: IoListRow[] } | { error: string };

function readExistingList(csv: Uint8Array): ExistingList {
  // The file was read up to the limit + 1: a longer one is cut, and rows
  // appended to what was parsed would duplicate or glue onto its real end.
  if (csv.byteLength > IO_FILE_MAX_BYTES) {
    return {
      error: `${IO_LIST_FILE_NAME} is too large to update (over ${IO_FILE_MAX_BYTES} bytes).`,
    };
  }
  const decoded = decodeIoList(csv);
  if ("problem" in decoded) {
    return { error: `${IO_LIST_FILE_NAME}: ${decoded.problem.message}` };
  }
  const parsed = parseIoList(decoded.text);
  if (parsed.problems.length > 0) {
    return {
      error: `${IO_LIST_FILE_NAME} has syntax problems, so rows cannot be appended safely (run "pantin validate").`,
    };
  }
  return { text: decoded.text, rows: parsed.rows };
}

async function updateExisting(
  folder: string,
  csv: Uint8Array,
  createModules: boolean,
  tags: ReturnType<typeof ioTagsOf>,
): Promise<InitResult> {
  const existing = readExistingList(csv);
  if ("error" in existing) {
    return REFUSED([existing.error]);
  }
  const mapped = new Set(existing.rows.map((row) => row.tag));
  const unmapped = tags.filter((tag) => !mapped.has(tag.name));
  if (createModules) {
    await writeFile(join(folder, IO_MODULES_FILE_NAME), modulesText(INIT_MODULES_FILE), {
      flag: "wx",
    });
  }
  if (unmapped.length > 0) {
    await appendRows(folder, existing.text, initRows(unmapped, usedAddresses(existing.rows)));
  }
  const message =
    unmapped.length === 0
      ? "Nothing to add: every tag is mapped."
      : `Appended ${unmapped.length} row(s) to ${IO_LIST_FILE_NAME}.`;
  return { exitCode: 0, messages: [message], errors: [] };
}
