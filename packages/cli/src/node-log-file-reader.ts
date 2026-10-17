import { type FileHandle, open, stat } from "node:fs/promises";
import { isErrorWithCode } from "@pantin/core";
import type { LogFileReader } from "./bridge-log-follow.ts";

export const nodeLogFileReader: LogFileReader = {
  sizeOf: (path) =>
    stat(path).then(
      (stats) => stats.size,
      (error: unknown) => {
        if (isErrorWithCode(error, "ENOENT")) {
          return undefined;
        }
        throw error;
      },
    ),
  readFrom: async (path, offset) => {
    let file: FileHandle;
    try {
      file = await open(path, "r");
    } catch (error) {
      if (isErrorWithCode(error, "ENOENT")) {
        return new Uint8Array();
      }
      throw error;
    }
    try {
      const { size } = await file.stat();
      const buffer = new Uint8Array(Math.max(0, size - offset));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
      return buffer.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  },
};
