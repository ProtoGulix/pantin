import type { LogFileSystem } from "../bridge/bridge-log-file.ts";

// A log file system in memory for tests; `files` is what is "on disk".
export type MemoryLogFileSystem = LogFileSystem & {
  files: Map<string, string>;
  // Makes the next appends fail with this error, until set back to undefined.
  failAppendsWith: Error | undefined;
};

export function createMemoryLogFileSystem(): MemoryLogFileSystem {
  const files = new Map<string, string>();
  const system: MemoryLogFileSystem = {
    files,
    failAppendsWith: undefined,
    makeDirectory: async () => undefined,
    append: async (path, text) => {
      if (system.failAppendsWith !== undefined) {
        throw system.failAppendsWith;
      }
      files.set(path, (files.get(path) ?? "") + text);
    },
    sizeOf: async (path) => Buffer.byteLength(files.get(path) ?? ""),
    rename: async (from, to) => {
      files.set(to, files.get(from) ?? "");
      files.delete(from);
    },
    readText: async (path) => files.get(path) ?? "",
  };
  return system;
}
