import type { RedundantJointsList } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import { PantinApiError } from "../api-transport.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildMenuBar } from "../menu/menu-model.ts";
import { buildPromptView } from "../panel/prompt-model.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { runMenuCommand } from "./menu-commands.ts";
import { resolvePrompt } from "./session-actions.ts";

// Édition > Supprimer les liaisons fixes redondantes… (ADR 0060 point 5).

const t = createTranslator("fr");
const frame = { key: "main", name: "main" };
const preview: RedundantJointsList = {
  redundant: [
    { id: "star-a", name: "Star A", assembly: frame },
    { id: "star-b", name: "Star B", assembly: frame },
  ],
  kept: [],
};

function openStore(api: Parameters<typeof testStore>[0]) {
  const store = testStore({ listPantins: async () => [], ...api });
  store.requestedPantinId = "press";
  store.state = withOpenPantin(store.state, pantinResponse(false));
  return store;
}

const run = (store: ReturnType<typeof openStore>) =>
  runMenuCommand(store, "deleteRedundantJoints", () => undefined);

function messageText(store: ReturnType<typeof openStore>): string {
  const message = store.state.message;
  return message === null ? "" : t(message.key, message.parameters);
}

describe("the preview", () => {
  it("says so and opens no prompt when nothing is redundant", async () => {
    const store = openStore({ listRedundantJoints: async () => ({ redundant: [], kept: [] }) });
    run(store);
    await vi.waitFor(() => expect(store.state.message).not.toBeNull());
    expect(messageText(store)).toBe("Aucune liaison fixe redondante.");
    expect(buildPromptView(store.state, t)).toBeNull();
  });

  it("opens the prompt with its two buttons", async () => {
    const store = openStore({ listRedundantJoints: async () => preview });
    run(store);
    await vi.waitFor(() => expect(store.state.pendingRedundantJoints).not.toBeNull());
    const view = buildPromptView(store.state, t);
    expect(view?.text).toContain("Supprimer 2 liaisons fixes redondantes ?");
    expect(view?.actions.map(({ label }) => label)).toEqual(["Supprimer", "Annuler"]);
  });

  it("shows the core's refusal as any other command", async () => {
    const listRedundantJoints = vi.fn(async () => {
      throw new PantinApiError("api", "no such Pantin", "not_found", 404);
    });
    const store = openStore({ listRedundantJoints });
    run(store);
    await vi.waitFor(() => expect(store.state.message?.level).toBe("error"));
    expect(store.state.pendingRedundantJoints).toBeNull();
  });
});

describe("the confirmation", () => {
  async function askedStore(deleteRedundantJoints: PantinApiClient["deleteRedundantJoints"]) {
    const store = openStore({ listRedundantJoints: async () => preview, deleteRedundantJoints });
    run(store);
    await vi.waitFor(() => expect(store.state.pendingRedundantJoints).not.toBeNull());
    return store;
  }

  it("sends exactly the previewed ids, shows the Pantin and the outcome", async () => {
    const deleteRedundantJoints = vi.fn(async () => ({
      pantin: pantinResponse(true),
      deletedJoints: [
        { id: "star-a", name: "Star A" },
        { id: "star-b", name: "Star B" },
      ],
      skipped: [],
    }));
    const store = await askedStore(deleteRedundantJoints);
    resolvePrompt(store, "confirmRedundantJoints");
    await vi.waitFor(() => expect(store.state.pendingRedundantJoints).toBeNull());
    expect(deleteRedundantJoints).toHaveBeenCalledWith("press", ["star-a", "star-b"]);
    expect(store.state.openPantin?.unsavedChanges).toBe(true);
    expect(messageText(store)).toBe(
      "2 liaisons fixes supprimées : Star A, Star B. Annulable par « Ne pas enregistrer » à la fermeture.",
    );
  });

  it("reports the skipped ids", async () => {
    const deleteRedundantJoints = vi.fn(async () => ({
      pantin: pantinResponse(true),
      deletedJoints: [{ id: "star-a", name: "Star A" }],
      skipped: ["star-b"],
    }));
    const store = await askedStore(deleteRedundantJoints);
    resolvePrompt(store, "confirmRedundantJoints");
    await vi.waitFor(() => expect(store.state.pendingRedundantJoints).toBeNull());
    expect(messageText(store)).toBe(
      "1 liaison fixe supprimée : Star A. 1 ignorée : modifiée ou supprimée entre-temps. Annulable par « Ne pas enregistrer » à la fermeture.",
    );
  });

  it("sends nothing when the user cancels", async () => {
    const deleteRedundantJoints = vi.fn<PantinApiClient["deleteRedundantJoints"]>();
    const store = await askedStore(deleteRedundantJoints);
    resolvePrompt(store, "cancelRedundantJoints");
    expect(store.state.pendingRedundantJoints).toBeNull();
    expect(deleteRedundantJoints).not.toHaveBeenCalled();
  });
});

describe("the menu entry", () => {
  function enabled(state: Parameters<typeof buildMenuBar>[0]): boolean | undefined {
    const entries = buildMenuBar(state, t).flatMap((menu) => menu.entries);
    for (const entry of entries) {
      if (entry.type === "item" && entry.command === "deleteRedundantJoints") {
        return entry.enabled;
      }
    }
    return undefined;
  }

  it("comes right after Dégrouper", () => {
    const edit = buildMenuBar(openStore({}).state, t).find((menu) => menu.id === "edit");
    const commands = edit?.entries.flatMap((entry) =>
      entry.type === "item" ? [entry.command] : [],
    );
    const index = commands?.indexOf("ungroup") ?? -1;
    expect(commands?.[index + 1]).toBe("deleteRedundantJoints");
  });

  it("is enabled with a Pantin open and idle", () => {
    expect(enabled(openStore({}).state)).toBe(true);
  });

  it("is disabled with no Pantin, while a request runs and during an import", () => {
    const store = openStore({});
    expect(enabled({ ...store.state, openPantin: null })).toBe(false);
    expect(enabled({ ...store.state, pendingRequestCount: 1 })).toBe(false);
    expect(enabled({ ...store.state, importInProgress: true })).toBe(false);
  });
});
