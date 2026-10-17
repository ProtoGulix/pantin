import { join } from "node:path";
import type { PantinId } from "@pantin/protocol";
import {
  type BridgeLogLevel,
  formatBridgeLogLine,
  formatCoreLogLine,
} from "../domain/bridge-log-lines.ts";

// The bridge log file of each Pantin (ADR 0054 point 2): <logs dir>/<pantinId>/bridge.log,
// appended line by line, renamed to bridge.log.1 when it passes 1 MB. The
// file system is injected; appends are chained so that lines stay in order.

export const BRIDGE_LOG_FILE_NAME = "bridge.log";
export const BRIDGE_LOG_ROTATED_FILE_NAME = "bridge.log.1";
export const BRIDGE_LOG_MAX_BYTES = 1024 * 1024;

export type LogFileSystem = {
  makeDirectory(path: string): Promise<void>;
  append(path: string, text: string): Promise<void>;
  // 0 for a file that does not exist.
  sizeOf(path: string): Promise<number>;
  // Replaces the target.
  rename(from: string, to: string): Promise<void>;
  // "" for a file that does not exist.
  readText(path: string): Promise<string>;
};

export type BridgeLogFile = {
  coreEvent(pantinId: PantinId, level: BridgeLogLevel, text: string): void;
  bridgeLine(pantinId: PantinId, line: string): void;
  // The current file, after the writes already asked for.
  read(pantinId: PantinId): Promise<string>;
  // Settles when every write asked for has been tried.
  flush(): Promise<void>;
};

export type BridgeLogFileOptions = {
  logsDirectory: string;
  fileSystem: LogFileSystem;
  now: () => Date;
  // Called once, with the first failed write; the bridge keeps running.
  reportWriteFailure: (error: unknown) => void;
};

export function createBridgeLogFile(options: BridgeLogFileOptions): BridgeLogFile {
  const { logsDirectory, fileSystem, now, reportWriteFailure } = options;
  const sizes = new Map<PantinId, number>();
  let queue: Promise<void> = Promise.resolve();
  let failureReported = false;

  const pathOf = (pantinId: PantinId, fileName: string): string =>
    join(logsDirectory, pantinId, fileName);

  async function write(pantinId: PantinId, line: string): Promise<void> {
    const text = `${line}\n`;
    const path = pathOf(pantinId, BRIDGE_LOG_FILE_NAME);
    let size = sizes.get(pantinId);
    if (size === undefined) {
      await fileSystem.makeDirectory(join(logsDirectory, pantinId));
      size = await fileSystem.sizeOf(path);
    }
    if (size >= BRIDGE_LOG_MAX_BYTES) {
      await fileSystem.rename(path, pathOf(pantinId, BRIDGE_LOG_ROTATED_FILE_NAME));
      size = 0;
    }
    await fileSystem.append(path, text);
    sizes.set(pantinId, size + Buffer.byteLength(text));
  }

  function enqueue(pantinId: PantinId, line: string): void {
    queue = queue.then(() =>
      write(pantinId, line).catch((error: unknown) => {
        // The size may be stale after a failure: read it again at the next write.
        sizes.delete(pantinId);
        if (!failureReported) {
          failureReported = true;
          reportWriteFailure(error);
        }
      }),
    );
  }

  return {
    coreEvent: (pantinId, level, text) => enqueue(pantinId, formatCoreLogLine(now(), level, text)),
    bridgeLine: (pantinId, line) => enqueue(pantinId, formatBridgeLogLine(now(), line)),
    read: async (pantinId) => {
      await queue;
      return fileSystem.readText(pathOf(pantinId, BRIDGE_LOG_FILE_NAME));
    },
    flush: () => queue,
  };
}
