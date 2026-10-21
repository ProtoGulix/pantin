import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COIL, unsavedChanges, useIoAxis } from "../test-support/io-edits.ts";
import { discardAxis, loadIo } from "../test-support/io-files.ts";
import { sendRaw } from "../test-support/test-server.ts";

// The I/O edit routes when the mapping cannot be edited (ADR 0049 points 4, 6
// and 8), and what they do to unsavedChanges (point 3).

const io = useIoAxis();
const save = () => sendRaw(io.axis().server, "POST", "/api/pantins/axis/save");

describe("edits while the mapping cannot be edited", () => {
  it("answers 409 to every write while io.json is unreadable", async () => {
    await loadIo(io.axis(), "{nope");
    expect((await io.addModule()).status).toBe(409);
    expect((await io.call("PATCH", "/modules/m1", {})).status).toBe(409);
    expect((await io.call("DELETE", "/modules/m1")).status).toBe(409);
    expect((await io.mapTags([COIL])).status).toBe(409);
    expect((await io.call("PATCH", `/modules/m1/channels/${COIL}`, {})).status).toBe(409);
    expect((await io.call("DELETE", `/modules/m1/channels/${COIL}`)).status).toBe(409);
    expect((await io.call("GET", "")).answer.problems[0]?.code).toBe("invalid_json");
  });

  it("answers 404 to an edit of a module or a tag when there is no mapping yet", async () => {
    expect((await io.call("PATCH", "/modules/m1", {})).status).toBe(404);
    expect((await io.call("DELETE", "/modules/m1")).status).toBe(404);
    expect((await io.mapTags([COIL])).status).toBe(404);
    expect((await io.call("DELETE", `/modules/m1/channels/${COIL}`)).status).toBe(404);
  });
});

describe("unsavedChanges and save", () => {
  it("becomes true after a route edit, and false after the save wrote io.json", async () => {
    expect(await unsavedChanges(io.axis())).toBe(false);
    await io.addModule();
    expect(await unsavedChanges(io.axis())).toBe(true);
    const ioPath = join(io.axis().workspace.pantinsDirectory, "axis", "io.json");
    await expect(readFile(ioPath)).rejects.toThrow();
    expect((await save()).status).toBe(200);
    expect(await unsavedChanges(io.axis())).toBe(false);
    expect(JSON.parse(await readFile(ioPath, "utf8")).modules).toHaveLength(1);
  });

  it("is true again after editing a saved mapping, and discard goes back to the file", async () => {
    await io.addModule();
    await save();
    await io.mapTags([COIL]);
    expect(await unsavedChanges(io.axis())).toBe(true);
    await discardAxis(io.axis());
    expect(await unsavedChanges(io.axis())).toBe(false);
    expect((await io.call("GET", "")).answer.modules[0]?.channels).toEqual([]);
  });

  it("is true after the last module is deleted from a saved mapping", async () => {
    await io.addModule();
    await save();
    await io.call("DELETE", "/modules/m1");
    expect(await unsavedChanges(io.axis())).toBe(true);
  });
});
