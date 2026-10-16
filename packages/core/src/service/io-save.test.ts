import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IoDocument, IoModule, PantinId } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serializeIoDocument } from "../domain/io-document-text.ts";
import { createPantinDocument, serializePantinDocument } from "../domain/pantin-document.ts";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";
import { discardPantin, savePantin } from "./mesh-lifecycle.ts";
import { loadPantin, toResponse } from "./open-pantins.ts";
import { createServiceContext } from "./pantin-service.ts";

// Open, save and discard of io.json beside pantin.json (ADR 0049 point 3).

const ID = "axis" as PantinId;
const MODULE: IoModule = {
  key: "m1",
  port: 1502,
  unitId: 1,
  wordOrder: "low_word_first",
  watchdogMilliseconds: 1000,
  channels: [
    { tag: "a.b.c", variable: "a_b_c", zone: "coil", address: 0, ioType: "BOOL", comment: "" },
  ],
};
const MAPPING: IoDocument = { schema_version: 1, modules: [MODULE] };
const OTHER: IoDocument = { schema_version: 1, modules: [{ ...MODULE, port: 1600 }] };

let directory: string;
let writes: string[];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pantin-io-save-"));
  writes = [];
  const store = createPantinStore(directory);
  await store.createPantinFolder(ID);
  await store.writeDocumentAtomically(ID, serializePantinDocument(createPantinDocument("Axis")));
});

afterEach(async () => {
  await rm(directory, { recursive: true });
});

// A store that records which file each atomic write is for, in order.
function recordingStore(): PantinStore {
  const store = createPantinStore(directory);
  return {
    ...store,
    writeDocumentAtomically: (id, text) => {
      writes.push("pantin.json");
      return store.writeDocumentAtomically(id, text);
    },
    writeIoAtomically: (id, text) => {
      writes.push("io.json");
      return store.writeIoAtomically(id, text);
    },
  };
}

const ioPath = () => join(directory, ID, "io.json");
const open = () => createServiceContext(recordingStore(), undefined, {});

describe("opening", () => {
  it("is missing and unchanged with no io.json", async () => {
    const context = open();
    const pantin = await loadPantin(context, ID);
    expect(pantin.io).toEqual({ kind: "missing" });
    expect(toResponse(ID, pantin).unsavedChanges).toBe(false);
  });

  it("reads io.json, and a hand formatted file is not an unsaved change", async () => {
    await writeFile(ioPath(), JSON.stringify(MAPPING));
    const context = open();
    const pantin = await loadPantin(context, ID);
    expect(pantin.io).toEqual({ kind: "document", document: MAPPING });
    expect(toResponse(ID, pantin).unsavedChanges).toBe(false);
  });

  it("keeps an unreadable io.json as it is: no unsaved change, and a save leaves it alone", async () => {
    await writeFile(ioPath(), "{nope");
    const context = open();
    const pantin = await loadPantin(context, ID);
    expect(pantin.io.kind).toBe("unreadable");
    expect(toResponse(ID, pantin).unsavedChanges).toBe(false);
    pantin.document = { ...pantin.document, name: "Renamed" };
    await savePantin(context, ID);
    expect(await readFile(ioPath(), "utf8")).toBe("{nope");
  });
});

describe("unsavedChanges over both files", () => {
  it("is true when only the mapping changed, then false after the save", async () => {
    await writeFile(ioPath(), serializeIoDocument(MAPPING));
    const context = open();
    const pantin = await loadPantin(context, ID);
    pantin.io = { kind: "document", document: OTHER };
    expect(toResponse(ID, pantin).unsavedChanges).toBe(true);
    expect((await savePantin(context, ID)).unsavedChanges).toBe(false);
    expect(await readFile(ioPath(), "utf8")).toBe(serializeIoDocument(OTHER));
  });

  it("is true when only pantin.json changed", async () => {
    await writeFile(ioPath(), serializeIoDocument(MAPPING));
    const pantin = await loadPantin(open(), ID);
    pantin.document = { ...pantin.document, name: "Renamed" };
    expect(toResponse(ID, pantin).unsavedChanges).toBe(true);
  });

  it("is true for a first mapping on a Pantin that had none", async () => {
    const pantin = await loadPantin(open(), ID);
    pantin.io = { kind: "document", document: MAPPING };
    expect(toResponse(ID, pantin).unsavedChanges).toBe(true);
  });
});

describe("saving", () => {
  it("writes io.json, then pantin.json, and leaves no temporary file", async () => {
    const context = open();
    const pantin = await loadPantin(context, ID);
    pantin.io = { kind: "document", document: MAPPING };
    pantin.document = { ...pantin.document, name: "Renamed" };
    await savePantin(context, ID);
    expect(writes).toEqual(["io.json", "pantin.json"]);
    expect(await readFile(ioPath(), "utf8")).toBe(serializeIoDocument(MAPPING));
    expect(await readdir(join(directory, ID))).not.toContainEqual(expect.stringMatching(/tmp$/));
  });

  it("writes io.json only when its text changed", async () => {
    await writeFile(ioPath(), serializeIoDocument(MAPPING));
    const context = open();
    const pantin = await loadPantin(context, ID);
    pantin.document = { ...pantin.document, name: "Renamed" };
    await savePantin(context, ID);
    expect(writes).toEqual(["pantin.json"]);
    pantin.io = { kind: "document", document: OTHER };
    await savePantin(context, ID);
    await savePantin(context, ID);
    expect(writes).toEqual(["pantin.json", "io.json", "pantin.json", "pantin.json"]);
  });

  it("does not write pantin.json when io.json fails, so nothing is half saved", async () => {
    const store = createPantinStore(directory);
    const failing: PantinStore = {
      ...store,
      writeIoAtomically: () => Promise.reject(new Error("disk full")),
    };
    const context = createServiceContext(failing, undefined, {});
    const pantin = await loadPantin(context, ID);
    pantin.io = { kind: "document", document: MAPPING };
    pantin.document = { ...pantin.document, name: "Renamed" };
    await expect(savePantin(context, ID)).rejects.toThrow("disk full");
    expect((await store.readDocumentText(ID)) ?? "").toContain('"Axis"');
    expect(toResponse(ID, pantin).unsavedChanges).toBe(true);
  });
});

describe("discarding", () => {
  it("reverts both files, and re-reads io.json, which is how an outside edit is picked up", async () => {
    await writeFile(ioPath(), serializeIoDocument(MAPPING));
    const context = open();
    const pantin = await loadPantin(context, ID);
    pantin.io = { kind: "document", document: OTHER };
    pantin.document = { ...pantin.document, name: "Renamed" };
    expect((await discardPantin(context, ID)).unsavedChanges).toBe(false);
    expect(pantin.io).toEqual({ kind: "document", document: MAPPING });
    expect(pantin.document.name).toBe("Axis");
    await writeFile(ioPath(), serializeIoDocument(OTHER));
    await discardPantin(context, ID);
    expect(pantin.io).toEqual({ kind: "document", document: OTHER });
  });

  it("goes back to missing when io.json was removed", async () => {
    await writeFile(ioPath(), serializeIoDocument(MAPPING));
    const context = open();
    const pantin = await loadPantin(context, ID);
    await rm(ioPath());
    await discardPantin(context, ID);
    expect(pantin.io).toEqual({ kind: "missing" });
  });
});
