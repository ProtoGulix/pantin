import { join } from "node:path";
import { evaluateIoMapping, type IoFiles, ioTagsOf, readFileUpTo } from "@pantin/core";
import {
  IO_FILE_MAX_BYTES,
  IO_LIST_FILE_NAME,
  IO_MODULES_FILE_NAME,
  type IoMappingResponse,
  type IoProblem,
  type PantinDocument,
} from "@pantin/protocol";

// The I/O mapping of a Pantin folder, read offline with the core's own code
// (ADR 0045 points 7 and 9): the same checks as GET .../io, against the tags
// of the folder's saved pantin.json.

export function readIoFiles(folder: string): Promise<IoFiles> {
  return Promise.all([
    readFileUpTo(join(folder, IO_LIST_FILE_NAME), IO_FILE_MAX_BYTES),
    readFileUpTo(join(folder, IO_MODULES_FILE_NAME), IO_FILE_MAX_BYTES),
  ]).then(([csv, modules]) => ({ csv, modules }));
}

export async function readFolderIo(
  folder: string,
  document: PantinDocument,
): Promise<IoMappingResponse> {
  return evaluateIoMapping(await readIoFiles(folder), ioTagsOf(document));
}

/** "io.csv:3:5: message" for a problem with a position, "io-modules.json: message" otherwise. */
export function describeIoProblem(problem: IoProblem): string {
  const where =
    problem.line === null || problem.column === null
      ? problem.file
      : `${problem.file}:${problem.line}:${problem.column}`;
  return `${where}: ${problem.message}`;
}
