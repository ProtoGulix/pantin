import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { createInterface } from "node:readline";

// The real core as a child process, launched the way `pnpm serve` launches it, on a free port
// (port 0) with its own Pantins folder: the test drives it through its HTTP API only.

const REPOSITORY_ROOT = join(import.meta.dirname, "../../..");
const CORE_ENTRY = join(REPOSITORY_ROOT, "packages/core/src/main.ts");
const STARTUP_TIMEOUT_MILLISECONDS = 20_000;
const STOP_TIMEOUT_MILLISECONDS = 10_000;
const LISTENING_LINE = /^Pantin core \(.*\) on http:\/\/(\S+):(\d+)$/;
const LOG_TAIL_LINES = 40;

export type CoreProcessOptions = {
  pantinsDirectory: string;
  pkiDirectory: string;
  bridgePython: string;
  opcuaBridge: string;
};

export type CoreProcess = {
  /** `http://127.0.0.1:<port>` */
  baseUrl: string;
  /** The last lines the core and its bridges wrote, for a failure message. */
  logTail(): string;
  /** SIGTERM, which makes the core stop its bridges, then SIGKILL if it does not end. */
  stop(): Promise<void>;
};

function coreArguments(options: CoreProcessOptions): string[] {
  return [
    CORE_ENTRY,
    "--port",
    "0",
    "--pantins-dir",
    options.pantinsDirectory,
    "--bridge-python",
    options.bridgePython,
    "--opcua-bridge",
    options.opcuaBridge,
    "--opcua-pki-dir",
    options.pkiDirectory,
  ];
}

function hasEnded(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (hasEnded(child)) {
    return;
  }
  const ended = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MILLISECONDS);
  try {
    await ended;
  } finally {
    clearTimeout(timeout);
  }
}

// Resolves with the base URL from the core's first output line that gives it.
function waitForListeningLine(child: ChildProcess, tail: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const remember = (line: string): void => {
      tail.push(line);
      tail.splice(0, Math.max(0, tail.length - LOG_TAIL_LINES));
    };
    const timeout = setTimeout(
      () => reject(new Error(`The core did not listen in time:\n${tail.join("\n")}`)),
      STARTUP_TIMEOUT_MILLISECONDS,
    );
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`The core ended with code ${code} before listening:\n${tail.join("\n")}`));
    });
    for (const stream of [child.stdout, child.stderr]) {
      if (stream === null) {
        continue;
      }
      createInterface({ input: stream }).on("line", (line) => {
        remember(line);
        const match = LISTENING_LINE.exec(line);
        if (match !== null) {
          clearTimeout(timeout);
          resolve(`http://${match[1]}:${match[2]}`);
        }
      });
    }
  });
}

export async function startCoreProcess(options: CoreProcessOptions): Promise<CoreProcess> {
  const child = spawn(process.execPath, coreArguments(options), {
    cwd: REPOSITORY_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tail: string[] = [];
  try {
    const baseUrl = await waitForListeningLine(child, tail);
    return { baseUrl, logTail: () => tail.join("\n"), stop: () => stopChild(child) };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}
