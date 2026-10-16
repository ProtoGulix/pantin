import { randomUUID } from "node:crypto";
import { link, lstat, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isErrorWithCode, readFileUpTo, serializeIoDocument } from "@pantin/core";
import {
  IO_FILE_MAX_BYTES,
  IO_JSON_FILE_NAME,
  type IoChannel,
  IoChannelSchema,
  type IoDocument,
  IoDocumentSchema,
} from "@pantin/protocol";
import { type CommandResult, refused } from "./command-result.ts";
import { decodeIoList, type IoListRow, parseIoList } from "./legacy-csv/io-list.ts";
import { readLegacyModules } from "./legacy-csv/legacy-modules.ts";
import {
  IO_LIST_FILE_NAME,
  IO_MODULES_FILE_NAME,
  type LegacyIoModulesFile,
} from "./legacy-csv/legacy-types.ts";

// `pantin io migrate <folder>` (ADR 0049 point 8): io.csv and io-modules.json
// become io.json, once, on request. Anything io.json cannot hold is refused
// with the position in io.csv; the rest (unknown tags, overlaps, variable
// names) is carried over, for the editor and `pantin validate` to show.

type Located = { line: number; column: number; message: string };

const describe = ({ line, column, message }: Located): string =>
  `${IO_LIST_FILE_NAME}:${line}:${column}: ${message}`;

function byPosition(first: Located, second: Located): number {
  return first.line - second.line || first.column - second.column;
}

// A row io.json cannot hold: the schema is the judge, so that this command
// and the core never disagree about what a channel is.
function channelOf(row: IoListRow): IoChannel | Located[] {
  const candidate = {
    tag: row.tag,
    variable: row.variable,
    zone: row.zone,
    address: row.address,
    ioType: row.ioType,
    comment: row.comment,
  };
  const result = IoChannelSchema.safeParse(candidate);
  if (result.success) {
    return result.data;
  }
  return result.error.issues.map((issue) => {
    const field = issue.path[0] === "address" ? "address" : "tag";
    return { line: row.line, column: row.columns[field], message: `${field}: ${issue.message}` };
  });
}

type Conversion = { channels: Map<string, IoChannel[]>; problems: Located[] };

function convertRows(rows: readonly IoListRow[], moduleKeys: ReadonlySet<string>): Conversion {
  const channels = new Map<string, IoChannel[]>();
  const firstLineOfTag = new Map<string, number>();
  const problems: Located[] = [];
  for (const row of rows) {
    const first = firstLineOfTag.get(row.tag);
    if (first !== undefined) {
      const message = `Tag "${row.tag}" is already mapped on line ${first}: a tag is mapped once.`;
      problems.push({ line: row.line, column: row.columns.tag, message });
      continue;
    }
    firstLineOfTag.set(row.tag, row.line);
    if (!moduleKeys.has(row.module)) {
      const message = `Module "${row.module}" is not in ${IO_MODULES_FILE_NAME}.`;
      problems.push({ line: row.line, column: row.columns.module, message });
      continue;
    }
    const channel = channelOf(row);
    if (Array.isArray(channel)) {
      problems.push(...channel);
    } else {
      channels.set(row.module, [...(channels.get(row.module) ?? []), channel]);
    }
  }
  return { channels, problems: problems.toSorted(byPosition) };
}

function documentOf(modules: LegacyIoModulesFile, channels: Map<string, IoChannel[]>): IoDocument {
  // parse, not safeParse: keys, ports, tags and channels were all checked above,
  // so a failure here is a bug of this command, not a user error.
  return IoDocumentSchema.parse({
    schema_version: 1,
    modules: modules.modules.map((module) => ({
      ...module,
      channels: channels.get(module.key) ?? [],
    })),
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function listProblems(csv: Uint8Array | undefined): { rows: IoListRow[] } | { errors: string[] } {
  if (csv === undefined) {
    return { errors: [`${IO_LIST_FILE_NAME} is missing: there is nothing to migrate.`] };
  }
  if (csv.byteLength > IO_FILE_MAX_BYTES) {
    return { errors: [`${IO_LIST_FILE_NAME} is larger than ${IO_FILE_MAX_BYTES} bytes.`] };
  }
  const decoded = decodeIoList(csv);
  if ("problem" in decoded) {
    return { errors: [describe(decoded.problem)] };
  }
  const parsed = parseIoList(decoded.text);
  if (parsed.problems.length > 0) {
    return { errors: parsed.problems.toSorted(byPosition).map(describe) };
  }
  return { rows: parsed.rows };
}

type Read = { bytes: Uint8Array | undefined } | { error: string };

async function readLegacy(path: string): Promise<Read> {
  try {
    return { bytes: await readFileUpTo(path, IO_FILE_MAX_BYTES) };
  } catch (error) {
    return {
      error: `${path} cannot be read (${reasonOf(error)}): fix it, then run migrate again.`,
    };
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Writes the text to a temporary file, then links it to its name: the link
// fails with EEXIST rather than replacing a file that appeared meanwhile, and
// a reader never sees a half written io.json beside the legacy files.
async function writeWithoutOverwrite(folder: string, text: string): Promise<void> {
  const temporary = join(folder, `.${IO_JSON_FILE_NAME}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
    await link(temporary, join(folder, IO_JSON_FILE_NAME));
  } finally {
    await rm(temporary, { force: true });
  }
}

async function commit(
  folder: string,
  document: IoDocument,
  channels: number,
): Promise<CommandResult> {
  try {
    await writeWithoutOverwrite(folder, serializeIoDocument(document));
  } catch (error) {
    if (isErrorWithCode(error, "EEXIST")) {
      return refused([EXISTING_MESSAGE(folder)]);
    }
    return refused([
      `${IO_JSON_FILE_NAME} could not be written (${reasonOf(error)}): nothing was changed.`,
    ]);
  }
  // io.json is on disk: only now are the legacy files deleted.
  const failed: string[] = [];
  for (const name of [IO_LIST_FILE_NAME, IO_MODULES_FILE_NAME]) {
    try {
      await rm(join(folder, name));
    } catch {
      failed.push(name);
    }
  }
  if (failed.length > 0) {
    return refused([
      `${IO_JSON_FILE_NAME} written; delete ${failed.join(" and ")} by hand (removal failed): the core reports them until then.`,
    ]);
  }
  return {
    exitCode: 0,
    messages: [
      `Wrote ${IO_JSON_FILE_NAME} (${channels} channels in ${document.modules.length} modules) and deleted ${IO_LIST_FILE_NAME} and ${IO_MODULES_FILE_NAME}.`,
      `Run "pantin validate ${folder}" to see the problems carried over, if any.`,
    ],
    errors: [],
  };
}

// The same advice as the core's legacy_io_files problem, so the tools agree.
const EXISTING_MESSAGE = (folder: string): string =>
  `${IO_JSON_FILE_NAME} already exists in ${folder}: migrate never overwrites it. If it is the one to keep, delete ${IO_LIST_FILE_NAME} and ${IO_MODULES_FILE_NAME}, which it replaces; to convert them instead, move ${IO_JSON_FILE_NAME} away first.`;

export async function ioMigrate(folder: string): Promise<CommandResult> {
  if (await exists(join(folder, IO_JSON_FILE_NAME))) {
    return refused([EXISTING_MESSAGE(folder)]);
  }
  const csv = await readLegacy(join(folder, IO_LIST_FILE_NAME));
  const modulesFile = await readLegacy(join(folder, IO_MODULES_FILE_NAME));
  const readErrors = [csv, modulesFile].flatMap((read) => ("error" in read ? [read.error] : []));
  if (readErrors.length > 0 || !("bytes" in csv) || !("bytes" in modulesFile)) {
    return refused(readErrors);
  }
  const list = listProblems(csv.bytes);
  const modules = readLegacyModules(modulesFile.bytes);
  if ("errors" in list || "problems" in modules) {
    return refused([
      ...("errors" in list ? list.errors : []),
      ...("problems" in modules ? modules.problems : []),
    ]);
  }
  const moduleKeys = new Set(modules.modules.modules.map((module) => module.key));
  const converted = convertRows(list.rows, moduleKeys);
  if (converted.problems.length > 0) {
    return refused(converted.problems.map(describe));
  }
  return commit(folder, documentOf(modules.modules, converted.channels), list.rows.length);
}
