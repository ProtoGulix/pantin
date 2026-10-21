import { join } from "node:path";
import type { PantinId, TransportKind } from "@pantin/protocol";
import {
  type BridgeLogLevel,
  formatBridgeLogLine,
  formatCoreLogLine,
} from "../domain/bridge-log-lines.ts";

// The bridge log file of each Pantin and kind (ADR 0054 point 2, ADR 0065 point 7):
// <logs dir>/<pantinId>/bridge-<kind>.log, appended line by line, renamed to
// bridge-<kind>.log.1 when it passes 1 MB. An old bridge.log is left as it is. The
// file system is injected; appends are chained so that lines stay in order.

export function bridgeLogFileName(kind: TransportKind): string {
  return `bridge-${kind}.log`;
}

export function bridgeLogRotatedFileName(kind: TransportKind): string {
  return `${bridgeLogFileName(kind)}.1`;
}

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
  coreEvent(pantinId: PantinId, kind: TransportKind, level: BridgeLogLevel, text: string): void;
  bridgeLine(pantinId: PantinId, kind: TransportKind, line: string): void;
  // The current file of the kind, after the writes already asked for.
  read(pantinId: PantinId, kind: TransportKind): Promise<string>;
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
  const sizes = new Map<string, number>();
  let queue: Promise<void> = Promise.resolve();
  let failureReported = false;

  const pathOf = (pantinId: PantinId, fileName: string): string =>
    join(logsDirectory, pantinId, fileName);
  const sizeKeyOf = (pantinId: PantinId, kind: TransportKind): string => `${kind}:${pantinId}`;

  async function write(pantinId: PantinId, kind: TransportKind, line: string): Promise<void> {
    const text = `${line}\n`;
    const path = pathOf(pantinId, bridgeLogFileName(kind));
    let size = sizes.get(sizeKeyOf(pantinId, kind));
    if (size === undefined) {
      await fileSystem.makeDirectory(join(logsDirectory, pantinId));
      size = await fileSystem.sizeOf(path);
    }
    if (size >= BRIDGE_LOG_MAX_BYTES) {
      await fileSystem.rename(path, pathOf(pantinId, bridgeLogRotatedFileName(kind)));
      size = 0;
    }
    await fileSystem.append(path, text);
    sizes.set(sizeKeyOf(pantinId, kind), size + Buffer.byteLength(text));
  }

  function enqueue(pantinId: PantinId, kind: TransportKind, line: string): void {
    queue = queue.then(() =>
      write(pantinId, kind, line).catch((error: unknown) => {
        // The size may be stale after a failure: read it again at the next write.
        sizes.delete(sizeKeyOf(pantinId, kind));
        if (!failureReported) {
          failureReported = true;
          reportWriteFailure(error);
        }
      }),
    );
  }

  return {
    coreEvent: (pantinId, kind, level, text) =>
      enqueue(pantinId, kind, formatCoreLogLine(now(), level, text)),
    bridgeLine: (pantinId, kind, line) => enqueue(pantinId, kind, formatBridgeLogLine(now(), line)),
    read: async (pantinId, kind) => {
      await queue;
      return fileSystem.readText(pathOf(pantinId, bridgeLogFileName(kind)));
    },
    flush: () => queue,
  };
}
