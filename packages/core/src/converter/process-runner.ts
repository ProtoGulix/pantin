import type { ChildProcess } from "node:child_process";
import type { ProcessOutcome } from "./converter-output.ts";

// Starts a program with an argument array, never through a shell. Injected so
// tests and callers choose the implementation (node:child_process spawn).
export type ProcessSpawner = (
  command: string,
  args: readonly string[],
  options: { stdio: ["ignore", "pipe", "pipe"]; shell: false },
) => ChildProcess;

export type ProcessLimits = {
  timeLimitMs: number;
  // Two waits of this length: between SIGTERM and SIGKILL once the time limit
  // is reached, and, after the process exited, for its pipes to drain before
  // they are destroyed.
  killGraceMs: number;
  // Per stream; beyond it the process is killed and the run fails.
  maxOutputBytes: number;
};

type RunState = {
  stdout: Buffer[];
  stderr: Buffer[];
  timedOut: boolean;
  outputTooLarge: boolean;
};

function stopProcess(child: ChildProcess, killGraceMs: number): void {
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }, killGraceMs).unref();
}

function collect(
  child: ChildProcess,
  streamName: "stdout" | "stderr",
  state: RunState,
  limits: ProcessLimits,
): void {
  let receivedBytes = 0;
  child[streamName]?.on("data", (chunk: Buffer) => {
    receivedBytes += chunk.byteLength;
    if (receivedBytes > limits.maxOutputBytes) {
      if (!state.outputTooLarge) {
        state.outputTooLarge = true;
        stopProcess(child, limits.killGraceMs);
      }
      return;
    }
    state[streamName].push(chunk);
  });
}

function toOutcome(
  state: RunState,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
): ProcessOutcome {
  return {
    exitCode,
    signal,
    // Decoded once at the end, so no multi-byte character is split between chunks.
    stdout: Buffer.concat(state.stdout).toString("utf8"),
    stderr: Buffer.concat(state.stderr).toString("utf8"),
    timedOut: state.timedOut,
    outputTooLarge: state.outputTooLarge,
  };
}

// Calls `onSettled` once. It waits for "close" (all output read) but never for
// "close" alone: a grandchild that inherited the pipes keeps them open after
// the converter is gone, and "close" would never come. After "exit" the pipes
// get one grace period to drain, then they are destroyed. Simpler than a
// process group (detached spawn plus kill(-pid)), which a grandchild calling
// setsid() escapes anyway.
function onceSettled(
  child: ChildProcess,
  graceMs: number,
  onSettled: (exitCode: number | null, signal: NodeJS.Signals | null) => void,
): void {
  let settled = false;
  const settle = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
    if (!settled) {
      settled = true;
      child.stdout?.destroy();
      child.stderr?.destroy();
      onSettled(exitCode, signal);
    }
  };
  child.on("exit", (exitCode, signal) => {
    setTimeout(() => settle(exitCode, signal), graceMs).unref();
  });
  child.on("close", settle);
}

// Rejects only when the program cannot be started at all (e.g. ENOENT).
export function runProcess(
  spawn: ProcessSpawner,
  command: string,
  args: readonly string[],
  limits: ProcessLimits,
): Promise<ProcessOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    const state: RunState = { stdout: [], stderr: [], timedOut: false, outputTooLarge: false };
    collect(child, "stdout", state, limits);
    collect(child, "stderr", state, limits);
    const timer = setTimeout(() => {
      state.timedOut = true;
      stopProcess(child, limits.killGraceMs);
    }, limits.timeLimitMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    onceSettled(child, limits.killGraceMs, (exitCode, signal) => {
      clearTimeout(timer);
      resolve(toOutcome(state, exitCode, signal));
    });
  });
}
