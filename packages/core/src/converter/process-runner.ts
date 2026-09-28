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
  // Delay between SIGTERM and SIGKILL once the time limit is reached.
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
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        // Decoded once at the end, so no multi-byte character is split between chunks.
        stdout: Buffer.concat(state.stdout).toString("utf8"),
        stderr: Buffer.concat(state.stderr).toString("utf8"),
        timedOut: state.timedOut,
        outputTooLarge: state.outputTooLarge,
      });
    });
  });
}
