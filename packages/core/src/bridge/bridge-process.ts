import type { ChildProcess } from "node:child_process";
import type { BridgeStatusLine } from "@pantin/protocol";
import type { ProcessSpawner } from "../converter/process-runner.ts";
import { parseStatusLine, splitLines } from "../domain/bridge-output.ts";

// One bridge child process (ADR 0050): the only effectful part of the
// supervisor. It starts the child, turns its output into lines and its end
// into one callback; what the lines mean is the state machine's business.

export type BridgeProcessHandlers = {
  onStatusLine(line: BridgeStatusLine): void;
  // Every stderr line, and the stdout lines that are not status lines.
  onLogLine(line: string): void;
  // The interpreter cannot be run (ENOENT, EACCES): no exit follows.
  onSpawnError(error: Error): void;
  onExit(exit: { exitCode: number | null; signal: string | null }): void;
};

export type BridgeProcess = {
  // SIGTERM, then SIGKILL after the grace delay. Harmless once the child ended.
  stop(): void;
  // Settles when the child ended or never started.
  exited: Promise<void>;
};

type LineReader = (chunk: string) => void;

function lineReader(onLine: (line: string) => void): { read: LineReader; flush: () => void } {
  let pending = "";
  return {
    read: (chunk) => {
      const split = splitLines(pending, chunk);
      pending = split.pending;
      split.lines.forEach(onLine);
    },
    flush: () => {
      if (pending !== "") {
        onLine(pending);
        pending = "";
      }
    },
  };
}

function hasEnded(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function watchOutput(child: ChildProcess, handlers: BridgeProcessHandlers): () => void {
  const stdout = lineReader((line) => {
    const status = parseStatusLine(line);
    if (status !== undefined) {
      handlers.onStatusLine(status);
    } else if (line !== "") {
      handlers.onLogLine(line);
    }
  });
  const stderr = lineReader((line) => {
    if (line !== "") {
      handlers.onLogLine(line);
    }
  });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", stdout.read);
  child.stderr?.on("data", stderr.read);
  return () => {
    stdout.flush();
    stderr.flush();
  };
}

export function startBridgeProcess(
  spawn: ProcessSpawner,
  command: string,
  args: readonly string[],
  killGraceMs: number,
  handlers: BridgeProcessHandlers,
): BridgeProcess {
  let child: ChildProcess;
  try {
    child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
  } catch (error) {
    handlers.onSpawnError(error instanceof Error ? error : new Error(String(error)));
    return { stop: () => undefined, exited: Promise.resolve() };
  }
  let killTimer: NodeJS.Timeout | undefined;
  const exited = new Promise<void>((resolveExited) => {
    const flushOutput = watchOutput(child, handlers);
    let settled = false;
    child.on("error", (error) => {
      // After a successful start an error means a failed kill: the exit follows.
      if (child.pid === undefined && !settled) {
        settled = true;
        handlers.onSpawnError(error);
        resolveExited();
      }
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(killTimer);
      flushOutput();
      handlers.onExit({ exitCode, signal });
      resolveExited();
    });
  });
  return {
    exited,
    stop: () => {
      if (hasEnded(child) || killTimer !== undefined) {
        return;
      }
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!hasEnded(child)) {
          child.kill("SIGKILL");
        }
      }, killGraceMs);
      killTimer.unref();
    },
  };
}
