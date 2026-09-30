// Public entry point of @pantin/core. The document reader serves the
// command line validator, which checks a folder without a server (ADR 0021).
export { type DocumentReading, readPantinDocument } from "./domain/pantin-document.ts";
export { ApiError } from "./errors.ts";
export {
  type PantinServerOptions,
  type RunningPantinServer,
  startPantinServer,
} from "./http/server.ts";
export { assertRealPathInside, isErrorWithCode, resolveInside } from "./store/safe-paths.ts";
