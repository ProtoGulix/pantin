// Public entry point of @pantin/core. The document reader serves the
// command line validator, which checks a folder without a server (ADR 0021).

export { BRIDGE_LOG_FILE_NAME, BRIDGE_LOG_ROTATED_FILE_NAME } from "./bridge/bridge-log-file.ts";
export { defaultLogsDirectory, defaultPantinsDirectory } from "./domain/default-directories.ts";
export { renderGvl } from "./domain/gvl.ts";
export { allocateVariable, proposeAddress, zoneAndTypeOf } from "./domain/io-allocation.ts";
export {
  type IoReading,
  readIoDocument,
  serializeIoDocument,
  unreadableFile,
} from "./domain/io-document-text.ts";
export { evaluateIoMapping, ioTagsOf } from "./domain/io-evaluation.ts";
export { describeIoProblem } from "./domain/io-problem-text.ts";
export { type DocumentReading, readPantinDocument } from "./domain/pantin-document.ts";
export { ApiError } from "./errors.ts";
export {
  type PantinServerOptions,
  type RunningPantinServer,
  startPantinServer,
} from "./http/server.ts";
export { writeTextAtomically } from "./store/atomic-write.ts";
export { readFileUpTo } from "./store/bounded-read.ts";
export { listLegacyIoFiles, readIoJson } from "./store/io-files.ts";
export { assertRealPathInside, isErrorWithCode, resolveInside } from "./store/safe-paths.ts";
