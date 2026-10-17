import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BridgeLogEnvironment } from "./bridge-log-command.ts";
import { completeLines, type LogFileReader } from "./bridge-log-follow.ts";
import { runCommand } from "./cli.ts";
import { nodeLogFileReader } from "./node-log-file-reader.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pantin-bridge-log-"));
});

afterEach(async () => {
  await rm(root, { recursive: true });
});

async function run(args: string[], environment?: BridgeLogEnvironment) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCommand(
    args,
    { stdout: { write: (t) => stdout.push(t) }, stderr: { write: (t) => stderr.push(t) } },
    environment ?? {
      homeDirectory: root,
      reader: nodeLogFileReader,
      clock: { sleep: async () => undefined, shouldContinue: () => false },
    },
  );
  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

async function writeLog(directory: string, text: string, name = "bridge.log") {
  await mkdir(join(directory, "axis"), { recursive: true });
  await writeFile(join(directory, "axis", name), text);
}

describe("pantin bridge-log", () => {
  it("prints the file of --logs-dir", async () => {
    await writeLog(join(root, "custom"), "line 1\nline 2\n");
    expect(await run(["bridge-log", "axis", "--logs-dir", join(root, "custom")])).toEqual({
      code: 0,
      stdout: "line 1\nline 2\n",
      stderr: "",
    });
  });

  it("defaults to <pantins dir>/.logs, and the pantins dir to pantin-projects in the home", async () => {
    await writeLog(join(root, "elsewhere", ".logs"), "from pantins dir\n");
    await writeLog(join(root, "pantin-projects", ".logs"), "from home\n");
    expect(
      (await run(["bridge-log", "axis", "--pantins-dir", join(root, "elsewhere")])).stdout,
    ).toBe("from pantins dir\n");
    expect((await run(["bridge-log", "axis"])).stdout).toBe("from home\n");
  });

  it("says where it looked when there is no file", async () => {
    const result = await run(["bridge-log", "axis", "--logs-dir", root]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`No bridge log at ${join(root, "axis", "bridge.log")}`);
  });

  it.each([
    [["bridge-log"]],
    [["bridge-log", "axis", "extra"]],
    [["bridge-log", "axis", "--unknown"]],
  ])("prints the usage for %j", async (args) => {
    const result = await run(args);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("bridge-log <pantinId>");
  });

  it("refuses an id that is not a Pantin id, so that it cannot leave the logs folder", async () => {
    const result = await run(["bridge-log", "../secret", "--logs-dir", root]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not a Pantin id");
  });
});

describe("pantin bridge-log --follow", () => {
  // A disk of two files and a clock that applies one change per sleep.
  function scripted(changes: ((files: Map<string, string>) => void)[], initial = "a\n") {
    const files = new Map<string, string>(initial === "" ? [] : [["/l/axis/bridge.log", initial]]);
    const reader: LogFileReader = {
      sizeOf: async (path) =>
        files.has(path) ? Buffer.byteLength(files.get(path) ?? "") : undefined,
      readFrom: async (path, offset) => Buffer.from(files.get(path) ?? "").subarray(offset),
    };
    let remaining = changes.length;
    return {
      environment: {
        homeDirectory: "/home",
        reader,
        clock: {
          sleep: async () => {
            changes[changes.length - remaining]?.(files);
            remaining -= 1;
          },
          shouldContinue: () => remaining > 0,
        },
      } satisfies BridgeLogEnvironment,
    };
  }

  it("prints what is appended, only complete lines, and follows a rotation", async () => {
    const { environment } = scripted([
      (files) => files.set("/l/axis/bridge.log", "a\nb\nhalf"),
      (files) => files.set("/l/axis/bridge.log", "a\nb\nhalf line\nc\n"),
      (files) => {
        // The core rotated: the old file went to .1 with one more line, a new one started.
        files.set("/l/axis/bridge.log.1", "a\nb\nhalf line\nc\nd\n");
        files.set("/l/axis/bridge.log", "e\n");
      },
    ]);
    const result = await run(["bridge-log", "axis", "--logs-dir", "/l", "--follow"], environment);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("a\nb\nhalf line\nc\nd\ne\n");
  });

  it("waits for a file that does not exist yet", async () => {
    const { environment } = scripted([(files) => files.set("/l/axis/bridge.log", "late\n")], "");
    const result = await run(["bridge-log", "axis", "--logs-dir", "/l", "--follow"], environment);
    expect(result).toEqual({ code: 0, stdout: "late\n", stderr: "" });
  });
});

describe("completeLines", () => {
  it("keeps a partial last line and multi-byte text whole", () => {
    expect(completeLines(Buffer.from("é\nab"))).toEqual({ text: "é\n", consumed: 3 });
    expect(completeLines(Buffer.from("no newline"))).toEqual({ text: "", consumed: 0 });
  });
});
