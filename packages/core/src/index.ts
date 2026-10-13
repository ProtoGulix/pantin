// Public entry point of @pantin/core. The document reader serves the
// command line validator, which checks a folder without a server (ADR 0021).

export {
  evaluateIoMapping,
  type IoFiles,
  ioTagsOf,
  readIoModules,
} from "./domain/io-evaluation.ts";
export { deriveVariable, variableProblemOf } from "./domain/io-identifiers.ts";
export { decodeIoList, type IoListProblem, type IoListRow, parseIoList } from "./domain/io-list.ts";
export { ioWidthOf } from "./domain/io-validation.ts";
export { type DocumentReading, readPantinDocument } from "./domain/pantin-document.ts";
export { ApiError } from "./errors.ts";
export {
  type PantinServerOptions,
  type RunningPantinServer,
  startPantinServer,
} from "./http/server.ts";
export { readFileUpTo } from "./store/bounded-read.ts";
export { assertRealPathInside, isErrorWithCode, resolveInside } from "./store/safe-paths.ts";
