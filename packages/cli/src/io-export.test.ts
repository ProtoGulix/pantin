import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";

// pantin io export and the --output option of the commands that generate a
// text (ADR 0049 amendment of 2026-10-20).

let workspace: string;
let folder: string;

beforeEach(async () => {
  workspace = await tmpWorkspace();
  folder = await copyAxisWithValve(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true });
});

const ioPath = () => join(folder, "io.json");
const ioText = () => readFile(ioPath(), "utf8");
// io init maps the four tags of axis.
const CHANNEL_COUNT = 4;

describe("pantin io export", () => {
  it("prints the CSV of a valid mapping, one row per channel, with a byte order mark", async () => {
    await runCli(["io", "init", folder]);
    const result = await runCli(["io", "export", folder]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.split("\r\n");
    expect(lines[0]).toBe("﻿module,port,unitId,tag,variable,zone,address,ioType,direction,comment");
    expect(lines[1]).toBe("m1,1502,1,axis.valve.coil_14,axis_valve_coil_14,coil,0,BOOL,command,");
    expect(lines).toHaveLength(CHANNEL_COUNT + 2);
  });

  it("refuses an invalid mapping with its problems, and prints no CSV", async () => {
    await runCli(["io", "init", folder]);
    await writeFile(ioPath(), (await ioText()).replace("axis.valve.coil_12", "axis.valve.ghost"));
    const result = await runCli(["io", "export", folder]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("The mapping is invalid, so no CSV is generated");
  });

  it("asks for io init when there is no io.json, and refuses a bad usage", async () => {
    const result = await runCli(["io", "export", folder]);
    expect([result.code, result.stderr]).toEqual([1, expect.stringContaining("pantin io init")]);
    expect((await runCli(["io", "export"])).code).toBe(2);
    expect((await runCli(["io", "export", folder, "extra"])).code).toBe(2);
    expect((await runCli(["io", "nothing"])).code).toBe(2);
  });
});

describe("--output", () => {
  it("writes the CSV bytes to the file, with the byte order mark, and prints nothing", async () => {
    await runCli(["io", "init", folder]);
    const target = join(workspace, "mapping.csv");
    const result = await runCli(["io", "export", folder, "--output", target]);
    expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
    const bytes = await readFile(target);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString("utf8")).toBe((await runCli(["io", "export", folder])).stdout);
  });

  it("is accepted before the folder, and by pantin gvl", async () => {
    await runCli(["io", "init", folder]);
    const target = join(workspace, "mapping.gvl");
    expect((await runCli(["gvl", "--output", target, folder])).code).toBe(0);
    expect(await readFile(target, "utf8")).toBe((await runCli(["gvl", folder])).stdout);
  });

  it("writes nothing when the mapping is refused", async () => {
    const target = join(workspace, "never.csv");
    const result = await runCli(["io", "export", folder, "--output", target]);
    expect(result.code).toBe(1);
    await expect(readFile(target)).rejects.toThrow();
  });

  it("reports a file that cannot be written, and refuses a missing file name", async () => {
    await runCli(["io", "init", folder]);
    const unwritable = join(workspace, "no-such-folder", "mapping.csv");
    const failed = await runCli(["io", "export", folder, "--output", unwritable]);
    expect([failed.code, failed.stderr]).toEqual([1, expect.stringContaining("Cannot write")]);
    expect((await runCli(["io", "export", folder, "--output"])).code).toBe(2);
    expect((await runCli(["io", "export", folder, "--output", "--output"])).code).toBe(2);
  });
});
