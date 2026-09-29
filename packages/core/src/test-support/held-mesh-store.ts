import { access } from "node:fs/promises";
import { join } from "node:path";
import { PantinDocumentSchema } from "@pantin/protocol";
import { createPantinStore, type PantinStore } from "../store/pantin-store.ts";

function fileExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

// A store that holds mesh writes until the test releases them, and records
// every pantin.json written that lists a mesh missing at that moment.
export function storeHoldingMeshWrites(pantinsDirectory: string, failWrites: boolean) {
  const store = createPantinStore(pantinsDirectory);
  const missingAtSave: string[] = [];
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signalWriteStarted = (): void => undefined;
  const meshWriteStarted = new Promise<void>((resolve) => {
    signalWriteStarted = resolve;
  });
  const checkedStore: PantinStore = {
    ...store,
    writeMesh: async (pantinId, meshPath, bytes) => {
      signalWriteStarted();
      await released;
      if (failWrites) {
        throw new Error("disk full");
      }
      await store.writeMesh(pantinId, meshPath, bytes);
    },
    writeDocumentAtomically: async (pantinId, text) => {
      const document = PantinDocumentSchema.parse(JSON.parse(text));
      for (const body of document.bodies) {
        if (!(await fileExists(join(pantinsDirectory, pantinId, body.mesh)))) {
          missingAtSave.push(body.mesh);
        }
      }
      await store.writeDocumentAtomically(pantinId, text);
    },
  };
  return { store: checkedStore, release, meshWriteStarted, missingAtSave };
}
