import type { OrphanMeshList } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildPromptView } from "../panel/prompt-model.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { bodyNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { runMenuCommand } from "./menu-commands.ts";
import { requestClose, requestDelete, resolvePrompt } from "./session-actions.ts";

// Fichier > Nettoyer les fichiers orphelins… (ADR 0038 point 7).

function listOf(count: number): OrphanMeshList {
  const files = Array.from({ length: count }, (_, index) => ({
    fileName: `f${String(index).padStart(3, "0")}.glb`,
    sizeInBytes: 2000,
  }));
  return { files, totalSizeInBytes: count * 2000 };
}

function openStore(api: Parameters<typeof testStore>[0], unsaved = true) {
  const store = testStore({ listPantins: async () => [], ...api });
  store.requestedPantinId = "press";
  store.state = withOpenPantin(store.state, pantinResponse(unsaved));
  return store;
}

const clean = (store: ReturnType<typeof openStore>) => {
  runMenuCommand(store, "cleanOrphans", () => undefined);
};

async function askedStore(count: number, api: Parameters<typeof testStore>[0] = {}) {
  const store = openStore({ listOrphanMeshes: async () => listOf(count), ...api });
  clean(store);
  await vi.waitFor(() => expect(store.state.pendingOrphanCleanup).not.toBeNull());
  return store;
}

describe("the preview", () => {
  it("shows 'Aucun fichier orphelin.' and opens no prompt when the list is empty", async () => {
    const listOrphanMeshes = vi.fn(async () => listOf(0));
    const store = openStore({ listOrphanMeshes });
    clean(store);
    await vi.waitFor(() => expect(store.state.message).not.toBeNull());
    expect(listOrphanMeshes).toHaveBeenCalledWith("press");
    const message = store.state.message;
    expect(message?.level).toBe("info");
    expect(createTranslator("fr")(message?.key ?? "message.saved")).toBe("Aucun fichier orphelin.");
    expect(store.state.pendingOrphanCleanup).toBeNull();
    expect(buildPromptView(store.state, createTranslator("fr"))).toBeNull();
  });

  it("opens the prompt with the count, the size and one line per file", async () => {
    const store = await askedStore(3);
    const view = buildPromptView(store.state, createTranslator("fr"));
    expect(view?.text).toContain("Supprimer 3 fichiers orphelins du dossier meshes (6");
    expect(view?.text).toContain("Aucun corps ne les utilise.");
    expect(view?.details).toHaveLength(3);
    expect(view?.actions.map(({ action }) => action)).toEqual([
      "confirmOrphanCleanup",
      "cancelOrphanCleanup",
    ]);
  });

  it("lists 20 lines then '… et 5 autres' for 25 files", async () => {
    const store = await askedStore(25);
    const details = buildPromptView(store.state, createTranslator("fr"))?.details ?? [];
    expect(details).toHaveLength(21);
    expect(details.at(-1)).toBe("… et 5 autres");
  });
});

describe("the preview, refused or late", () => {
  it("goes through the usual failure path when the core refuses", async () => {
    const listOrphanMeshes = vi.fn(async () => {
      throw new PantinApiError("api", "meshes is a link", "invalid_request", 400);
    });
    const store = openStore({ listOrphanMeshes });
    clean(store);
    await vi.waitFor(() => expect(store.state.message?.level).toBe("error"));
    expect(store.state.pendingOrphanCleanup).toBeNull();
    expect(store.state.pendingRequestCount).toBe(0);
  });

  it("leaves a close prompt that was already open alone", async () => {
    const store = openStore({ listOrphanMeshes: async () => listOf(2) });
    requestClose(store);
    clean(store);
    await vi.waitFor(() => expect(store.state.pendingRequestCount).toBe(0));
    expect(store.state.closePrompt).toBe(true);
    expect(store.state.pendingOrphanCleanup).toBeNull();
  });
});

describe("clearing pendingOrphanCleanup", () => {
  it("is done by Cancel, which Escape triggers as the 'cancel' choice", async () => {
    const store = await askedStore(2);
    const view = buildPromptView(store.state, createTranslator("fr"));
    const cancelChoice = view?.actions.find((entry) => entry.action.startsWith("cancel"));
    expect(cancelChoice?.action).toBe("cancelOrphanCleanup");
    resolvePrompt(store, "cancelOrphanCleanup");
    expect(store.state.pendingOrphanCleanup).toBeNull();
  });

  it("is done by closing the Pantin", async () => {
    const store = await askedStore(2);
    store.state = withOpenPantin(store.state, pantinResponse(false));
    store.state = { ...store.state, pendingOrphanCleanup: listOf(2) };
    requestClose(store);
    expect(store.state.openPantin).toBeNull();
    expect(store.state.pendingOrphanCleanup).toBeNull();
  });

  it("is done by a body delete request", async () => {
    const store = await askedStore(2);
    const bodyId = store.state.openPantin?.document.bodies[0]?.id ?? "";
    requestDelete(store, bodyNodeId("press", bodyId));
    expect(store.state.pendingDeleteBodyId).toBe(bodyId);
    expect(store.state.pendingOrphanCleanup).toBeNull();
  });

  it("is replaced by the preview, which clears the other pending deletions", async () => {
    const store = await askedStore(2);
    store.state = { ...store.state, pendingDeleteBodyId: "rail" };
    clean(store);
    await vi.waitFor(() => expect(store.state.pendingOrphanCleanup).not.toBeNull());
    expect(store.state.pendingDeleteBodyId).toBeNull();
  });
});

describe("Supprimer", () => {
  it("sends exactly the previewed names, in order", async () => {
    const deleteOrphanMeshes = vi.fn(async (_id: string, names: readonly string[]) => ({
      deleted: names.map((fileName) => ({ fileName, sizeInBytes: 2000 })),
      skipped: [],
      failed: [],
    }));
    const store = await askedStore(3, { deleteOrphanMeshes });
    resolvePrompt(store, "confirmOrphanCleanup");
    await vi.waitFor(() => expect(store.state.pendingOrphanCleanup).toBeNull());
    expect(deleteOrphanMeshes).toHaveBeenCalledOnce();
    expect(deleteOrphanMeshes).toHaveBeenCalledWith("press", ["f000.glb", "f001.glb", "f002.glb"]);
    expect(store.state.message?.key).toBe("message.orphanCleanup.deleted.other");
  });

  it("sends 450 names as 3 sequential batches (200, 200, 50) and merges the results", async () => {
    let running = 0;
    let overlap = false;
    const sizes: number[] = [];
    const deleteOrphanMeshes = vi.fn(async (_id: string, names: readonly string[]) => {
      running += 1;
      overlap ||= running > 1;
      await Promise.resolve();
      sizes.push(names.length);
      running -= 1;
      return {
        deleted: names.slice(1).map((fileName) => ({ fileName, sizeInBytes: 2000 })),
        skipped: names.slice(0, 1),
        failed: [],
      };
    });
    const store = await askedStore(450, { deleteOrphanMeshes });
    resolvePrompt(store, "confirmOrphanCleanup");
    await vi.waitFor(() => expect(store.state.pendingOrphanCleanup).toBeNull());
    expect(sizes).toEqual([200, 200, 50]);
    expect(overlap).toBe(false);
    const parameters = store.state.message?.parameters;
    expect(parameters).toMatchObject({ count: 447, skipped: 3 });
    expect(store.state.message?.detail).toBe("f000.glb, f200.glb, f400.glb");
  });
});

describe("Supprimer, answers", () => {
  it("shows an error with names and codes when a file failed", async () => {
    const deleteOrphanMeshes = async () => ({
      deleted: [],
      skipped: [],
      failed: [{ fileName: "a.glb", errorCode: "EACCES" }],
    });
    const store = await askedStore(1, { deleteOrphanMeshes });
    resolvePrompt(store, "confirmOrphanCleanup");
    await vi.waitFor(() => expect(store.state.message?.level).toBe("error"));
    expect(store.state.message?.detail).toBe("a.glb: EACCES");
    expect(store.state.pendingOrphanCleanup).toBeNull();
  });

  it("keeps the prompt and shows the failure when a request fails", async () => {
    const deleteOrphanMeshes = async () => {
      throw new PantinApiError("network", "down", null, null);
    };
    const store = await askedStore(2, { deleteOrphanMeshes });
    resolvePrompt(store, "confirmOrphanCleanup");
    await vi.waitFor(() => expect(store.state.message?.level).toBe("error"));
    expect(store.state.pendingOrphanCleanup).not.toBeNull();
  });
});
