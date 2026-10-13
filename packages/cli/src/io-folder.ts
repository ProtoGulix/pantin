import { join } from "node:path";
import {
  evaluateLegacyIoMapping,
  IO_LIST_FILE_NAME,
  IO_MODULES_FILE_NAME,
  ioTagsOf,
  type LegacyIoFiles,
  type LegacyIoMappingResponse,
  type LegacyIoProblem,
  readFileUpTo,
} from "@pantin/core";
import { IO_FILE_MAX_BYTES, type PantinDocument } from "@pantin/protocol";

// The legacy io.csv mapping of a Pantin folder (ADR 0049 point 8: P3 moves the
// CLI to io.json), read offline with the core's own code
// (ADR 0045 points 7 and 9): the same checks as GET .../io, against the tags
// of the folder's saved pantin.json.

export function readIoFiles(folder: string): Promise<LegacyIoFiles> {
  return Promise.all([
    readFileUpTo(join(folder, IO_LIST_FILE_NAME), IO_FILE_MAX_BYTES),
    readFileUpTo(join(folder, IO_MODULES_FILE_NAME), IO_FILE_MAX_BYTES),
  ]).then(([csv, modules]) => ({ csv, modules }));
}

export async function readFolderIo(
  folder: string,
  document: PantinDocument,
): Promise<LegacyIoMappingResponse> {
  return evaluateLegacyIoMapping(await readIoFiles(folder), ioTagsOf(document));
}

/** "io.csv:3:5: message" for a problem with a position, "io-modules.json: message" otherwise. */
export function describeIoProblem(problem: LegacyIoProblem): string {
  const where =
    problem.line === null || problem.column === null
      ? problem.file
      : `${problem.file}:${problem.line}:${problem.column}`;
  return `${where}: ${problem.message}`;
}
