import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import type { LogFileSystem } from "./bridge-log-file.ts";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export const nodeLogFileSystem: LogFileSystem = {
  makeDirectory: async (path) => {
    await mkdir(path, { recursive: true });
  },
  append: (path, text) => appendFile(path, text, "utf8"),
  sizeOf: (path) =>
    stat(path).then(
      (stats) => stats.size,
      (error: unknown) => {
        if (isMissing(error)) {
          return 0;
        }
        throw error;
      },
    ),
  rename,
  readText: (path) =>
    readFile(path, "utf8").then(
      (text) => text,
      (error: unknown) => {
        if (isMissing(error)) {
          return "";
        }
        throw error;
      },
    ),
};
