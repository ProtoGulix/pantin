// Public entry point of @pantin/core. The document reader serves the
// command line validator, which checks a folder without a server (ADR 0021).

export { ioTagsOf } from "./domain/io-evaluation.ts";
export { deriveVariable, variableProblemOf } from "./domain/io-identifiers.ts";
export { ioWidthOf } from "./domain/io-rules.ts";
export { type DocumentReading, readPantinDocument } from "./domain/pantin-document.ts";
export { ApiError } from "./errors.ts";
export {
  type PantinServerOptions,
  type RunningPantinServer,
  startPantinServer,
} from "./http/server.ts";
// Temporary (ADR 0049 point 8): the CSV reading the CLI still uses until P3.
export {
  evaluateLegacyIoMapping,
  type LegacyIoFiles,
  readLegacyIoModules,
} from "./legacy-csv/io-evaluation.ts";
export {
  decodeIoList,
  type IoListProblem,
  type IoListRow,
  parseIoList,
} from "./legacy-csv/io-list.ts";
export {
  IO_LIST_FILE_NAME,
  IO_LIST_HEADER,
  IO_MODULES_FILE_NAME,
  type LegacyIoMappingResponse,
  type LegacyIoModulesFile,
  type LegacyIoProblem,
  type LegacyIoRow,
} from "./legacy-csv/legacy-types.ts";
export { readFileUpTo } from "./store/bounded-read.ts";
export { assertRealPathInside, isErrorWithCode, resolveInside } from "./store/safe-paths.ts";
