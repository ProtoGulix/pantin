import { IO_JSON_FILE_NAME, type IoPath, type IoProblem } from "@pantin/protocol";

/** `modules[0].channels[3].address`: a JSON path as a person reads it; "" for the whole file. */
function formatIoPath(path: IoPath): string {
  return path
    .map((part, index) =>
      typeof part === "number" ? `[${part}]` : index === 0 ? part : `.${part}`,
    )
    .join("");
}

/**
 * "io.json: modules[0].channels[3].address: message". Two orders exist: the
 * paths of a `schema_invalid` problem index the file as written, while the
 * paths of every other problem index the mapping in canonical order (zone,
 * address, tag), which is the order of a file the core wrote. Callers say so
 * when the file is not canonical.
 */
export function describeIoProblem(problem: IoProblem): string {
  const where = formatIoPath(problem.path);
  return where === ""
    ? `${IO_JSON_FILE_NAME}: ${problem.message}`
    : `${IO_JSON_FILE_NAME}: ${where}: ${problem.message}`;
}
