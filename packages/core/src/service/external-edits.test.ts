import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PantinId } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPantinStore } from "../store/pantin-store.ts";
import { createPantinService } from "./pantin-service.ts";

// Warning about edits made outside Pantin (ADR 0063 points 1 to 4 and 6).

const ID = "axis" as PantinId;
let pantinsDirectory: string;

beforeEach(async () => {
  pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-external-"));
});

afterEach(async () => {
  await rm(pantinsDirectory, { recursive: true });
});

const documentPath = () => join(pantinsDirectory, ID, "pantin.json");
const ioPath = () => join(pantinsDirectory, ID, "io.json");

function newService() {
  return createPantinService(createPantinStore(pantinsDirectory), undefined);
}

async function openAxis() {
  const service = newService();
  await service.createPantin("Axis");
  return service;
}

// What another program does: same file, other bytes, a new modification time.
async function editOutside(path: string, text: string): Promise<void> {
  await writeFile(path, text);
  const later = new Date(Date.now() + 60_000);
  await utimes(path, later, later);
}

async function warnings(service: ReturnType<typeof newService>) {
  const { entries } = await service.readConsole(ID, 0);
  return entries.filter((entry) => entry.code === "file_changed_outside");
}

describe("detecting an edit outside Pantin", () => {
  it("sees an edited pantin.json, a created io.json and a deleted io.json", async () => {
    const service = await openAxis();
    expect((await service.getPantin(ID)).changedOutside).toEqual([]);

    const saved = await readFile(documentPath(), "utf8");
    await editOutside(documentPath(), saved.replace("Axis", "Axle"));
    await editOutside(ioPath(), "{}");
    expect((await service.getPantin(ID)).changedOutside).toEqual(["pantin.json", "io.json"]);

    const reopened = newService();
    expect((await reopened.getPantin(ID)).changedOutside).toEqual([]);
    await rm(ioPath());
    expect((await reopened.getPantin(ID)).changedOutside).toEqual(["io.json"]);
  });

  it("sees an edit that keeps the modification time but not the size", async () => {
    const service = await openAxis();
    const before = await stat(documentPath());
    await writeFile(documentPath(), `${await readFile(documentPath(), "utf8")} `);
    await utimes(documentPath(), before.atime, before.mtime);
    expect((await service.getPantin(ID)).changedOutside).toEqual(["pantin.json"]);
  });

  it("stays silent on a touch that leaves the bytes as they were", async () => {
    const service = await openAxis();
    await editOutside(documentPath(), await readFile(documentPath(), "utf8"));
    expect((await service.getPantin(ID)).changedOutside).toEqual([]);
    expect(await warnings(service)).toEqual([]);
  });

  it("writes one console warning for each new content, not one for each read", async () => {
    const service = await openAxis();
    await editOutside(ioPath(), "{}");
    await service.getPantin(ID);
    await service.getPantin(ID);
    expect(await warnings(service)).toMatchObject([
      { level: "warning", source: { kind: "pantin" }, params: { file: "io.json" }, count: 1 },
    ]);

    await editOutside(ioPath(), "[]");
    expect((await service.getPantin(ID)).changedOutside).toEqual(["io.json"]);
    const [entry] = await warnings(service);
    expect(entry?.count).toBe(2);
  });
});

describe("saving after an edit outside Pantin", () => {
  it("refuses the first save with a conflict, and the next one overwrites", async () => {
    const service = await openAxis();
    await service.renamePantin(ID, "Mine");
    await editOutside(documentPath(), "{}");

    await expect(service.savePantin(ID)).rejects.toMatchObject({
      code: "conflict",
      message:
        "pantin.json was modified outside Pantin since it was opened. Save again to overwrite it, or reload it.",
    });
    expect(await readFile(documentPath(), "utf8")).toBe("{}");
    expect((await service.getPantin(ID)).changedOutside).toEqual(["pantin.json"]);
    expect(await warnings(service)).toHaveLength(1);

    const saved = await service.savePantin(ID);
    expect(saved).toMatchObject({ changedOutside: [], unsavedChanges: false });
    expect(await readFile(documentPath(), "utf8")).toContain('"Mine"');
    expect((await service.getPantin(ID)).changedOutside).toEqual([]);
    expect(await warnings(service)).toHaveLength(1);
  });

  it("overwrites an io.json edited outside, even when the mapping did not change", async () => {
    await openAxis();
    const mapping = await readFile(
      new URL("../../../../examples/plc-cylinder/io.json", import.meta.url),
      "utf8",
    );
    await writeFile(ioPath(), mapping);
    const service = newService();
    await service.getPantin(ID);
    // Same mapping, other bytes: the in-memory text is unchanged, only the flag asks for a write.
    await editOutside(ioPath(), `${mapping} `);
    expect((await service.getPantin(ID)).changedOutside).toEqual(["io.json"]);
    expect((await service.savePantin(ID)).changedOutside).toEqual([]);
    expect(await readFile(ioPath(), "utf8")).toBe(mapping);
  });

  it("keeps io.json flagged when no mapping in memory could be written over it", async () => {
    await openAxis();
    // Not a mapping: the Pantin reads it as unreadable, so a save has nothing to write there.
    await editOutside(ioPath(), "not json");
    const reopened = newService();
    await reopened.getPantin(ID);
    await editOutside(ioPath(), "still not json");
    expect((await reopened.getPantin(ID)).changedOutside).toEqual(["io.json"]);
    expect((await reopened.savePantin(ID)).changedOutside).toEqual(["io.json"]);
    expect(await readFile(ioPath(), "utf8")).toBe("still not json");
    expect((await reopened.discardPantin(ID)).changedOutside).toEqual([]);
  });

  it("does not flag the files it wrote itself", async () => {
    const service = await openAxis();
    await service.renamePantin(ID, "Mine");
    await service.savePantin(ID);
    expect((await service.getPantin(ID)).changedOutside).toEqual([]);
  });
});

describe("discarding after an edit outside Pantin", () => {
  it("brings the disk content back and clears the flag", async () => {
    const service = await openAxis();
    const saved = await readFile(documentPath(), "utf8");
    await editOutside(documentPath(), saved.replace("Axis", "Axle"));
    expect((await service.getPantin(ID)).changedOutside).toEqual(["pantin.json"]);

    const discarded = await service.discardPantin(ID);
    expect(discarded.changedOutside).toEqual([]);
    expect(discarded.document.name).toBe("Axle");
    expect((await service.getPantin(ID)).changedOutside).toEqual([]);
  });
});

describe("a version 1 io.json (ADR 0064 point 7)", () => {
  const versionOne = () =>
    readFile(new URL("../../fixtures/io-v1/plc-cylinder.io.json", import.meta.url), "utf8");

  it("is migrated in memory but stamped as it is on disk: not reported", async () => {
    await openAxis();
    await writeFile(ioPath(), await versionOne());
    const service = newService();
    expect((await service.getPantin(ID)).changedOutside).toEqual([]);
    await service.discardPantin(ID);
    expect((await service.getPantin(ID)).changedOutside).toEqual([]);
  });

  it("is not reported after the save that rewrites it in version 2", async () => {
    await openAxis();
    await writeFile(ioPath(), await versionOne());
    const service = newService();
    await service.getPantin(ID);
    await service.savePantin(ID);
    expect(await readFile(ioPath(), "utf8")).not.toBe(await versionOne());
    expect((await service.getPantin(ID)).changedOutside).toEqual([]);
    expect((await service.savePantin(ID)).changedOutside).toEqual([]);
  });
});
