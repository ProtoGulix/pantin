import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IoDocumentSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";
import { IO_LIST_HEADER } from "./legacy-csv/legacy-types.ts";

// pantin io migrate (ADR 0049 point 8): success, each refusal, no overwrite,
// and the legacy files deleted only on success.

let workspace: string;
let folder: string;

beforeEach(async () => {
  workspace = await tmpWorkspace();
  folder = await copyAxisWithValve(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true });
});

const path = (name: string) => join(folder, name);
const read = (name: string) => readFile(path(name), "utf8");
const exists = (name: string) =>
  readFile(path(name)).then(
    () => true,
    () => false,
  );

const MODULES = JSON.stringify({
  schema_version: 1,
  modules: [
    { key: "m1", port: 1502 },
    { key: "m2", port: 1503, unitId: 3, watchdogMilliseconds: 500 },
  ],
});

// Rows are deliberately out of canonical order, and carry a comment.
const ROWS = [
  "axis.stroke.position;axis_stroke_position;m2;input_register;0;REAL;feedback",
  "axis.valve.coil_12;axis_valve_coil_12;m1;coil;1;BOOL;",
  "axis.valve.coil_14;axis_valve_coil_14;m1;coil;0;BOOL;",
];

async function writeLegacy(rows: string[] = ROWS, modules: string = MODULES): Promise<void> {
  await writeFile(path("io.csv"), [IO_LIST_HEADER, ...rows, ""].join("\n"));
  await writeFile(path("io-modules.json"), modules);
}

async function expectUntouched(): Promise<void> {
  expect(await exists("io.csv")).toBe(true);
  expect(await exists("io-modules.json")).toBe(true);
  expect(await exists("io.json")).toBe(false);
}

describe("pantin io migrate, success", () => {
  it("writes the canonical io.json, with type as ioType, then deletes the legacy files", async () => {
    await writeLegacy();
    const result = await runCli(["io", "migrate", folder]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Wrote io.json (3 channels in 2 modules)");
    const text = await read("io.json");
    const document = IoDocumentSchema.parse(JSON.parse(text));
    expect(text).toBe(`${JSON.stringify(document, null, 2)}\n`);
    expect(document.modules).toMatchObject([
      { key: "m1", port: 1502, unitId: 1, wordOrder: "low_word_first" },
      { key: "m2", port: 1503, unitId: 3, watchdogMilliseconds: 500 },
    ]);
    expect(document.modules[0]?.channels.map((channel) => channel.tag)).toEqual([
      "axis.valve.coil_14",
      "axis.valve.coil_12",
    ]);
    expect(document.modules[1]?.channels[0]).toEqual({
      tag: "axis.stroke.position",
      variable: "axis_stroke_position",
      zone: "input_register",
      address: 0,
      ioType: "REAL",
      comment: "feedback",
    });
    expect(await exists("io.csv")).toBe(false);
    expect(await exists("io-modules.json")).toBe(false);
  });

  it("carries unknown tags and overlaps into io.json, where validate shows them", async () => {
    await writeLegacy([
      "axis.valve.ghost;ghost;m1;coil;0;BOOL;",
      "axis.valve.coil_14;axis_valve_coil_14;m1;coil;0;BOOL;",
    ]);
    const result = await runCli(["io", "migrate", folder]);
    expect(result.code).toBe(0);
    const validated = await runCli(["validate", folder]);
    expect(validated.code).toBe(1);
    expect(validated.stderr).toContain('Tag "axis.valve.ghost" does not exist');
    expect(validated.stderr).toContain("overlaps");
  });
});

describe("pantin io migrate, refusals", () => {
  it("refuses a CSV syntax problem with io.csv:line:column, and keeps every file", async () => {
    await writeLegacy(["a;b;c", ROWS[0] ?? ""]);
    const result = await runCli(["io", "migrate", folder]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^error: io\.csv:2:\d+: A row has exactly 7 fields/m);
    await expectUntouched();
  });

  it("refuses a header that is not the exact one, and a byte order mark", async () => {
    await writeFile(path("io.csv"), "tag;oops\n");
    await writeFile(path("io-modules.json"), MODULES);
    expect((await runCli(["io", "migrate", folder])).stderr).toContain(
      "io.csv:1:5: The first line",
    );
    await writeFile(path("io.csv"), `﻿${IO_LIST_HEADER}\n`);
    expect((await runCli(["io", "migrate", folder])).stderr).toContain("io.csv:1:1: ");
    await expectUntouched();
  });

  it("refuses a missing io-modules.json", async () => {
    await writeLegacy();
    await rm(path("io-modules.json"));
    const result = await runCli(["io", "migrate", folder]);
    expect([result.code, result.stderr]).toEqual([
      1,
      expect.stringContaining("io-modules.json is missing"),
    ]);
    expect(await exists("io.csv")).toBe(true);
    expect(await exists("io.json")).toBe(false);
  });
});

describe("pantin io migrate, refusals of the modules file and the list", () => {
  it("refuses an invalid io-modules.json, and one that is not JSON", async () => {
    await writeLegacy(
      ROWS,
      JSON.stringify({ schema_version: 1, modules: [{ key: "m1", port: 80 }] }),
    );
    expect((await runCli(["io", "migrate", folder])).stderr).toContain(
      "io-modules.json: modules.0.port",
    );
    await writeFile(path("io-modules.json"), "{nope");
    expect((await runCli(["io", "migrate", folder])).stderr).toContain("not valid JSON");
    await expectUntouched();
  });

  it("refuses a missing io.csv", async () => {
    await writeFile(path("io-modules.json"), MODULES);
    const result = await runCli(["io", "migrate", folder]);
    expect([result.code, result.stderr]).toEqual([1, expect.stringContaining("io.csv is missing")]);
  });

  it("refuses a row whose module is unknown, at the module's column", async () => {
    await writeLegacy([ROWS[1]?.replace("m1", "m9") ?? ""]);
    const result = await runCli(["io", "migrate", folder]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('error: io.csv:2:39: Module "m9" is not in io-modules.json.');
    await expectUntouched();
  });
});

describe("pantin io migrate, refusals of the rows", () => {
  it("refuses a tag mapped twice, naming the first line", async () => {
    await writeLegacy([ROWS[1] ?? "", ROWS[1]?.replace(";coil;1;", ";coil;2;") ?? ""]);
    const result = await runCli(["io", "migrate", folder]);
    expect(result.stderr).toContain(
      'io.csv:3:1: Tag "axis.valve.coil_12" is already mapped on line 2',
    );
    await expectUntouched();
  });

  it("refuses an address that io.json cannot hold, and reports all refusals together", async () => {
    await writeLegacy([
      "axis.valve.coil_12;axis_valve_coil_12;m1;coil;70000;BOOL;",
      "axis.valve.coil_14;axis_valve_coil_14;m9;coil;0;BOOL;",
    ]);
    const result = await runCli(["io", "migrate", folder]);
    const lines = result.stderr.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^error: io\.csv:2:\d+: address: /);
    expect(lines[1]).toMatch(/^error: io\.csv:3:\d+: Module "m9"/);
    await expectUntouched();
  });
});

describe("pantin io migrate, no overwrite", () => {
  it("refuses when io.json exists, and changes nothing", async () => {
    await writeLegacy();
    await writeFile(path("io.json"), "keep me");
    const result = await runCli(["io", "migrate", folder]);
    expect([result.code, result.stderr]).toEqual([1, expect.stringContaining("never overwrites")]);
    expect(await read("io.json")).toBe("keep me");
    expect(await exists("io.csv")).toBe(true);
    expect(await exists("io-modules.json")).toBe(true);
  });

  it("refuses when io.json is a directory too", async () => {
    await writeLegacy();
    await mkdir(path("io.json"));
    expect((await runCli(["io", "migrate", folder])).code).toBe(1);
    expect(await exists("io.csv")).toBe(true);
  });

  it("takes exactly one folder", async () => {
    expect((await runCli(["io", "migrate"])).code).toBe(2);
    expect((await runCli(["io", "migrate", folder, folder])).code).toBe(2);
  });
});
