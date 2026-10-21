import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExampleStore } from "../store/example-store.ts";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";
import { createPantinService } from "./pantin-service.ts";

// The copy of an example is all or nothing (ADR 0062 point 4).

const PLC_CYLINDER = join(import.meta.dirname, "../../../../examples/plc-cylinder");

let root: string;
let pantinsDirectory: string;
let examplesDirectory: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pantin-example-copy-"));
  pantinsDirectory = join(root, "pantins");
  examplesDirectory = join(root, "examples");
  await mkdir(pantinsDirectory);
  await mkdir(examplesDirectory);
  await cp(PLC_CYLINDER, join(examplesDirectory, "plc-cylinder"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true });
});

function serviceWith(store: PantinStore) {
  return createPantinService(store, undefined, {
    exampleStore: createExampleStore(examplesDirectory, 10_000_000),
  });
}

describe("copyExample", () => {
  it("removes the folder it created when the second mesh write fails", async () => {
    const store = createPantinStore(pantinsDirectory);
    let writes = 0;
    const service = serviceWith({
      ...store,
      writeMesh: async (pantinId, meshPath, bytes) => {
        writes += 1;
        if (writes === 2) {
          throw new Error("disk full");
        }
        await store.writeMesh(pantinId, meshPath, bytes);
      },
    });
    await expect(service.copyExample("plc-cylinder", undefined)).rejects.toThrow("disk full");
    expect(await readdir(pantinsDirectory)).toEqual([]);
  });

  it("removes the folder when writing pantin.json fails, and leaves other Pantins alone", async () => {
    const store = createPantinStore(pantinsDirectory);
    const service = serviceWith({
      ...store,
      writeDocumentAtomically: async () => {
        throw new Error("read-only file system");
      },
    });
    await createPantinService(store, undefined).createPantin("Other");
    await expect(service.copyExample("plc-cylinder", undefined)).rejects.toThrow("read-only");
    expect(await readdir(pantinsDirectory)).toEqual(["other"]);
  });

  it("does not remove an existing folder when the id was taken meanwhile", async () => {
    const store = createPantinStore(pantinsDirectory);
    const service = serviceWith({
      ...store,
      listFolderNames: async () => [],
    });
    await createPantinService(store, undefined).createPantin("plc-cylinder");
    await expect(service.copyExample("plc-cylinder", undefined)).rejects.toThrow("already exists");
    expect(await readdir(pantinsDirectory)).toEqual(["plc-cylinder"]);
  });
});
