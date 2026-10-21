// Public entry point of @pantin/core. The document reader serves the
// command line validator, which checks a folder without a server (ADR 0021).

export { bridgeLogFileName, bridgeLogRotatedFileName } from "./bridge/bridge-log-file.ts";
export { defaultLogsDirectory, defaultPantinsDirectory } from "./domain/default-directories.ts";
export { renderGvl } from "./domain/gvl.ts";
export { addChannels } from "./domain/io-channel-edits.ts";
export { renderIoCsv } from "./domain/io-csv.ts";
export {
  type IoReading,
  readIoDocument,
  serializeIoDocument,
  unreadableFile,
} from "./domain/io-document-text.ts";
export { evaluateIoMapping, ioTagsOf } from "./domain/io-evaluation.ts";
export { addModule } from "./domain/io-module-edits.ts";
export { describeIoProblem } from "./domain/io-problem-text.ts";
export type { IoTag } from "./domain/io-validation.ts";
export { applyVariableAssignments } from "./domain/io-variable-edits.ts";
export { type DocumentReading, readPantinDocument } from "./domain/pantin-document.ts";
export { deriveSignals } from "./domain/signals.ts";
export { previewSymbolImport } from "./domain/symbol-preview.ts";
export { ApiError } from "./errors.ts";
export {
  type PantinServerOptions,
  type RunningPantinServer,
  startPantinServer,
} from "./http/server.ts";
export { writeTextAtomically } from "./store/atomic-write.ts";
export { readFileUpTo } from "./store/bounded-read.ts";
export { readIoJson } from "./store/io-files.ts";
export { assertRealPathInside, isErrorWithCode, resolveInside } from "./store/safe-paths.ts";
