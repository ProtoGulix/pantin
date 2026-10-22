import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { type BridgeStatusLine, BridgeStatusLineSchema } from "@pantin/protocol";

// Runs a TypeScript file of the bridge as the core would: `node <file> <arguments>`, a pipe for
// each of stdin, stdout and stderr, and the environment the core allows (ADR 0065 point 5).

const MAIN_PATH = join(import.meta.dirname, "..", "main.ts");

export type RunningBridge = {
  child: ChildProcess;
  stdout: string[];
  stderr: string[];
  /** The exit code (null when killed by a signal) once the process ended. */
  exited: Promise<number | null>;
  /** Resolves with the first stdout line that satisfies `predicate`. */
  waitForStdoutLine(predicate: (line: string) => boolean): Promise<string>;
};

function collectLines(stream: NodeJS.ReadableStream | null, into: string[], onLine: () => void) {
  let pending = "";
  stream?.setEncoding("utf8");
  stream?.on("data", (chunk: string) => {
    const parts = (pending + chunk).split("\n");
    pending = parts.pop() ?? "";
    into.push(...parts);
    onLine();
  });
  stream?.on("end", () => {
    if (pending !== "") {
      into.push(pending);
      onLine();
    }
  });
}

export function runBridgeProcess(
  args: readonly string[],
  options: { stdinText?: string; entry?: string; home?: string; keepStdinOpen?: boolean } = {},
): RunningBridge {
  const child = spawn(process.execPath, [options.entry ?? MAIN_PATH, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    env: { PATH: process.env.PATH ?? "", HOME: options.home ?? process.env.HOME ?? "" },
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  const watchers: Array<() => void> = [];
  collectLines(child.stdout, stdout, () => {
    for (const watcher of watchers) {
      watcher();
    }
  });
  collectLines(child.stderr, stderr, () => undefined);
  if (options.keepStdinOpen === true) {
    child.stdin?.write(options.stdinText ?? "");
  } else {
    child.stdin?.end(options.stdinText ?? "");
  }
  const exited = new Promise<number | null>((resolve) =>
    child.on("close", (code) => resolve(code)),
  );
  return {
    child,
    stdout,
    stderr,
    exited,
    waitForStdoutLine: (predicate) =>
      new Promise((resolve) => {
        const check = (): void => {
          const found = stdout.find(predicate);
          if (found !== undefined) {
            resolve(found);
          }
        };
        watchers.push(check);
        check();
      }),
  };
}

/** Every stdout line must be a status line: this throws on the first that is not. */
export function parseStatusLines(lines: readonly string[]): BridgeStatusLine[] {
  return lines.map((line) => BridgeStatusLineSchema.parse(JSON.parse(line)));
}
