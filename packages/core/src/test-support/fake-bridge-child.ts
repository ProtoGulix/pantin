import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ProcessSpawner } from "../converter/process-runner.ts";

// A bridge child that a test drives by hand: it writes the lines and ends when
// the test says so, and records the signals it receives.

type FakeBridgeChild = {
  signals: string[];
  // What the core wrote to the child's stdin, and whether it then closed it.
  stdinText(): string;
  isStdinClosed(): boolean;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
  end(exitCode: number | null, signal: string | null): void;
  failToStart(error: Error): void;
};

export type FakeSpawner = {
  spawn: ProcessSpawner;
  children: FakeBridgeChild[];
  calls: { command: string; args: readonly string[]; options: unknown }[];
};

type FakeProcessOptions = {
  // Ends at once on SIGTERM (a bridge that handles it); a stuck one waits for SIGKILL.
  exitsOnSigterm: boolean;
};

class FakeProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  stdinText = "";
  isStdinClosed = false;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  pid: number | undefined = 4242;
  exitCode: number | null = null;
  signalCode: string | null = null;
  readonly signals: string[] = [];

  private readonly behaviour: FakeProcessOptions;

  constructor(behaviour: FakeProcessOptions) {
    super();
    this.behaviour = behaviour;
    this.stdin.setEncoding("utf8");
    this.stdin.on("data", (chunk: string) => {
      this.stdinText += chunk;
    });
    this.stdin.on("finish", () => {
      this.isStdinClosed = true;
    });
  }

  kill(signal: string): boolean {
    this.signals.push(signal);
    if (signal === "SIGKILL" || this.behaviour.exitsOnSigterm) {
      this.end(signal === "SIGKILL" ? null : 0, signal === "SIGKILL" ? "SIGKILL" : null);
    }
    return true;
  }

  end(exitCode: number | null, signal: string | null): void {
    this.exitCode = exitCode;
    this.signalCode = signal;
    this.emit("close", exitCode, signal);
  }
}

export function createFakeSpawner(behaviour: Partial<FakeProcessOptions> = {}): FakeSpawner {
  const children: FakeBridgeChild[] = [];
  const calls: FakeSpawner["calls"] = [];
  const spawn: ProcessSpawner = (command, args, options) => {
    calls.push({ command, args, options });
    const fake = new FakeProcess({ exitsOnSigterm: behaviour.exitsOnSigterm ?? true });
    children.push({
      signals: fake.signals,
      stdinText: () => fake.stdinText,
      isStdinClosed: () => fake.isStdinClosed,
      writeStdout: (text) => fake.stdout.write(text),
      writeStderr: (text) => fake.stderr.write(text),
      end: (exitCode, signal) => fake.end(exitCode, signal),
      failToStart: (error) => {
        fake.pid = undefined;
        fake.emit("error", error);
        fake.emit("close", -2, null);
      },
    });
    // The supervisor only uses the parts of ChildProcess that FakeProcess
    // implements (streams, events, pid, exit state, kill). With stdio "ignore" it would have
    // no stdin: the fake keeps one so a test can tell that nothing was written.
    return fake as unknown as ChildProcess;
  };
  return { spawn, children, calls };
}
