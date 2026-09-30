import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { pantinResponse } from "../test-fixtures.ts";
import { testStore } from "./controller-test-helpers.ts";
import { createPantinFromFile } from "./import-actions.ts";

// "Depuis un fichier 3D" of the welcome dialog (ADR 0027).

function fileNamed(name: string): File {
  return new File(["data"], name);
}

function apiCreating(created: string[], listPantins = async () => []) {
  return {
    createPantin: async (name: string): Promise<PantinResponse> => {
      created.push(name);
      return pantinResponse(false, [], "robot");
    },
    listPantins,
  };
}

describe("createPantinFromFile", () => {
  it("creates a Pantin named after the file, opens it and starts the import form", async () => {
    const created: string[] = [];
    const store = testStore(apiCreating(created));
    await createPantinFromFile(store, fileNamed("3630 rail.step"));
    expect(created).toEqual(["3630 rail"]);
    expect(store.state.openPantin?.id).toBe("robot");
    expect(store.state.pendingImport?.fileName).toBe("3630 rail.step");
    expect(store.pendingImportFile?.name).toBe("3630 rail.step");
  });
});

describe("createPantinFromFile refusals", () => {
  it("creates nothing for an unsupported extension, and says so", async () => {
    const created: string[] = [];
    const store = testStore(apiCreating(created));
    await createPantinFromFile(store, fileNamed("part.obj"));
    expect(created).toEqual([]);
    expect(store.state.message?.key).toBe("message.unsupportedFile");
    expect(store.state.pendingImport).toBeNull();
  });

  it("refuses a file whose name is only spaces once the extension is removed", async () => {
    const created: string[] = [];
    const store = testStore(apiCreating(created));
    await createPantinFromFile(store, fileNamed("  .glb"));
    expect(created).toEqual([]);
    expect(store.state.message?.level).toBe("error");
  });

  it("cuts a name over the core's 200 characters instead of failing", async () => {
    const created: string[] = [];
    const store = testStore(apiCreating(created));
    await createPantinFromFile(store, fileNamed(`${"a".repeat(250)}.stl`));
    expect(created).toEqual(["a".repeat(200)]);
  });
});

describe("createPantinFromFile errors", () => {
  it("starts no import when the creation fails", async () => {
    const store = testStore({
      createPantin: async () => {
        throw new Error("The core refused the name.");
      },
    });
    await createPantinFromFile(store, fileNamed("robot.glb"));
    expect(store.state.message?.level).toBe("error");
    expect(store.state.openPantin).toBeNull();
    expect(store.state.pendingImport).toBeNull();
    expect(store.pendingImportFile).toBeNull();
  });

  it("keeps the error of the list refresh that follows the creation", async () => {
    const store = testStore(
      apiCreating([], async () => {
        throw new Error("The list is unreachable.");
      }),
    );
    await createPantinFromFile(store, fileNamed("robot.glb"));
    expect(store.state.message?.level).toBe("error");
    expect(store.state.pendingImport?.fileName).toBe("robot.glb");
  });
});
