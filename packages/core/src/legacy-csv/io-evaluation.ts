import { createHash } from "node:crypto";
import { IO_FILE_MAX_BYTES, type IoModuleSettings } from "@pantin/protocol";
import { decodeIoList, type IoListProblem, parseIoList } from "./io-list.ts";
import { type IoTag, validateIoRows } from "./io-validation.ts";
import {
  IO_LIST_FILE_NAME,
  IO_MODULES_FILE_NAME,
  type LegacyIoFileName,
  type LegacyIoMappingResponse,
  type LegacyIoModulesFile,
  LegacyIoModulesFileSchema,
  type LegacyIoProblem,
  type LegacyIoRow,
} from "./legacy-types.ts";

// The frozen evaluation of io.csv and io-modules.json (ADR 0049 point 8), for
// the CLI until slice P3. From the bytes of the two mapping files and the document's tags to the answer
// of GET .../io (ADR 0045 point 7): pure, the files are read by the caller.

export type LegacyIoFiles = {
  // undefined when the file does not exist.
  csv: Uint8Array | undefined;
  modules: Uint8Array | undefined;
};

type FileName = LegacyIoFileName;

/** SHA-256 of the two files' bytes, each preceded by its length so that they cannot blur. */
function ioMappingIdOf(files: LegacyIoFiles): string {
  const hash = createHash("sha256");
  for (const bytes of [files.csv, files.modules]) {
    hash.update(`${bytes === undefined ? "absent" : bytes.byteLength}:`);
    if (bytes !== undefined) {
      hash.update(bytes);
    }
  }
  return hash.digest("hex");
}

function csvProblems(problems: readonly IoListProblem[]): LegacyIoProblem[] {
  return problems.map((problem) => ({ file: IO_LIST_FILE_NAME, ...problem }));
}

function fileProblem(
  file: FileName,
  code: LegacyIoProblem["code"],
  message: string,
): LegacyIoProblem {
  return { file, line: null, column: null, code, message };
}

function tooLarge(file: FileName): LegacyIoProblem {
  return fileProblem(file, "file_too_large", `${file} is larger than ${IO_FILE_MAX_BYTES} bytes.`);
}

type ModulesReading = { modules: LegacyIoModulesFile | null; problems: LegacyIoProblem[] };

/** Decodes and checks io-modules.json; the CLI reuses it. */
export function readLegacyIoModules(bytes: Uint8Array | undefined): ModulesReading {
  const invalid = (message: string): ModulesReading => ({
    modules: null,
    problems: [fileProblem(IO_MODULES_FILE_NAME, "modules_invalid", message)],
  });
  if (bytes === undefined) {
    const message = `${IO_MODULES_FILE_NAME} is missing: run "pantin io init <folder> --update" or write it (module key, port).`;
    return {
      modules: null,
      problems: [fileProblem(IO_MODULES_FILE_NAME, "modules_missing", message)],
    };
  }
  if (bytes.byteLength > IO_FILE_MAX_BYTES) {
    return { modules: null, problems: [tooLarge(IO_MODULES_FILE_NAME)] };
  }
  let json: unknown;
  try {
    // A UTF-8 byte order mark is skipped here (TextDecoder default) while
    // io.csv refuses it: JSON.parse would fail on it and JSON editors add it
    // often, whereas the CSV format trims nothing and its header is exact.
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return invalid(`${IO_MODULES_FILE_NAME} is not valid JSON (${reason}).`);
  }
  const result = LegacyIoModulesFileSchema.safeParse(json);
  if (result.success) {
    return { modules: result.data, problems: [] };
  }
  return {
    modules: null,
    problems: result.error.issues.map((issue) =>
      fileProblem(
        IO_MODULES_FILE_NAME,
        "modules_invalid",
        `${issue.path.join(".") || "(file)"}: ${issue.message}`,
      ),
    ),
  };
}

function rowsOf(
  parsed: ReturnType<typeof parseIoList>["rows"],
  tags: readonly IoTag[],
): LegacyIoRow[] {
  const byName = new Map(tags.map((tag) => [tag.name, tag]));
  return parsed.map(({ columns: _columns, ...row }) => {
    const tag = byName.get(row.tag);
    return { ...row, type: tag?.type ?? null, direction: tag?.direction ?? null };
  });
}

function response(
  parts: Partial<LegacyIoMappingResponse> & Pick<LegacyIoMappingResponse, "status">,
): LegacyIoMappingResponse {
  return { mappingId: null, modules: [], rows: [], problems: [], unmappedTags: [], ...parts };
}

/** Reads and checks the mapping of one Pantin against its tags. */
export function evaluateLegacyIoMapping(
  files: LegacyIoFiles,
  tags: readonly IoTag[],
): LegacyIoMappingResponse {
  const allTags = tags.map((tag) => tag.name);
  if (files.csv === undefined) {
    return response({ status: "missing", unmappedTags: allTags });
  }
  const mappingId = ioMappingIdOf(files);
  const reading = readLegacyIoModules(files.modules);
  if (files.csv.byteLength > IO_FILE_MAX_BYTES) {
    return response({
      status: "invalid",
      mappingId,
      problems: [tooLarge(IO_LIST_FILE_NAME), ...reading.problems],
      unmappedTags: allTags,
    });
  }
  const decoded = decodeIoList(files.csv);
  if ("problem" in decoded) {
    return response({
      status: "invalid",
      mappingId,
      problems: [...csvProblems([decoded.problem]), ...reading.problems],
      unmappedTags: allTags,
    });
  }
  const parsed = parseIoList(decoded.text);
  const moduleKeys =
    reading.modules === null
      ? null
      : new Set(reading.modules.modules.map((module: IoModuleSettings) => module.key));
  const validation = validateIoRows({ rows: parsed.rows, tags, moduleKeys });
  const problems = [
    ...csvProblems(parsed.problems),
    ...csvProblems(validation.problems),
    ...reading.problems,
  ];
  return response({
    status: problems.length === 0 ? "valid" : "invalid",
    mappingId,
    modules: reading.modules?.modules ?? [],
    rows: rowsOf(parsed.rows, tags),
    problems,
    unmappedTags: validation.unmappedTags,
  });
}
