import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import { PantinApiError } from "../api-transport.ts";
import { consolePantin } from "../console/console-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildPanelView } from "../view-model.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { flush } from "./bridge-test-helpers.ts";
import { testStore } from "./controller-test-helpers.ts";
import {
  cancelReload,
  readOpenPantinAgain,
  requestReload,
  rereadOnFocus,
} from "./external-edit-actions.ts";
import { savePantin } from "./pantin-actions.ts";
import { resolvePrompt } from "./session-actions.ts";

const clean: PantinResponse = { ...consolePantin, unsavedChanges: false, changedOutside: [] };
const outside: PantinResponse = { ...clean, changedOutside: ["pantin.json"] };

function openStore(open: PantinResponse, api: Partial<PantinApiClient>) {
  const calls: string[] = [];
  const store = testStore({
    getPantin: async () => {
      calls.push("get");
      return outside;
    },
    discardPantin: async () => {
      calls.push("discard");
      return clean;
    },
    listPantins: async () => [],
    ...api,
  });
  store.requestedPantinId = open.id;
  store.update(withOpenPantin(store.state, open));
  return { store, calls };
}

const banner = (store: ReturnType<typeof testStore>) =>
  buildPanelView(store.state, store.consoleList, false).externalEdit;

describe("re-reading when the window gets the focus back", () => {
  it("shows the banner from the fresh Pantin", async () => {
    const { store, calls } = openStore(clean, {});
    expect(banner(store)).toBeNull();
    await rereadOnFocus(store, 5_000);
    expect(calls).toEqual(["get"]);
    expect(banner(store)?.text).toContain("pantin.json");
  });

  it("reads once for the focus and visibility events of one return", async () => {
    const { store, calls } = openStore(clean, {});
    await rereadOnFocus(store, 5_000);
    await rereadOnFocus(store, 5_100);
    await rereadOnFocus(store, 7_000);
    expect(calls).toEqual(["get", "get"]);
  });

  it("skips while a request is in flight", async () => {
    const { store, calls } = openStore(clean, {});
    store.state = { ...store.state, pendingRequestCount: 1 };
    await rereadOnFocus(store, 5_000);
    expect(calls).toEqual([]);
  });

  it("does nothing with no Pantin open", async () => {
    const calls: string[] = [];
    const store = testStore({
      getPantin: async () => {
        calls.push("get");
        return outside;
      },
    });
    await rereadOnFocus(store, 5_000);
    expect(calls).toEqual([]);
  });
});

describe("the reload action", () => {
  it("reloads at once when nothing is unsaved", async () => {
    const { store, calls } = openStore(outside, {});
    await requestReload(store);
    expect(calls).toEqual(["discard"]);
    expect(banner(store)).toBeNull();
  });

  it("asks first over unsaved changes, then discards on confirmation", async () => {
    const { store, calls } = openStore({ ...outside, unsavedChanges: true }, {});
    await requestReload(store);
    expect(calls).toEqual([]);
    const prompt = buildPanelView(store.state, store.consoleList, false).prompt;
    expect(prompt?.actions.map((entry) => entry.action)).toEqual(["confirmReload", "cancelReload"]);
    expect(prompt?.text).toContain("pantin.json");
    resolvePrompt(store, "confirmReload");
    await flush();
    expect(calls).toEqual(["discard"]);
    expect(store.state.pendingReload).toBe(false);
    expect(store.state.openPantin?.changedOutside).toEqual([]);
  });

  it("keeps the edits and the banner when the question is cancelled", async () => {
    const { store, calls } = openStore({ ...outside, unsavedChanges: true }, {});
    await requestReload(store);
    cancelReload(store);
    expect(calls).toEqual([]);
    expect(store.state.pendingReload).toBe(false);
    expect(banner(store)).not.toBeNull();
  });

  it("drops the question when a re-read finds the outside edit gone", async () => {
    const { store } = openStore(
      { ...outside, unsavedChanges: true },
      { getPantin: async () => clean },
    );
    await requestReload(store);
    expect(store.state.pendingReload).toBe(true);
    await readOpenPantinAgain(store);
    expect(store.state.pendingReload).toBe(false);
  });

  it("drops the question when the save went through", async () => {
    const { store } = openStore(
      { ...outside, unsavedChanges: true },
      { savePantin: async () => clean },
    );
    await requestReload(store);
    await savePantin(store);
    expect(store.state.pendingReload).toBe(false);
  });

  it("does nothing when no file changed", async () => {
    const { store, calls } = openStore(clean, {});
    await requestReload(store);
    expect(calls).toEqual([]);
  });

  it("says why when the core refuses", async () => {
    const refusal = new PantinApiError("api", "no", "not_found", 404);
    const { store } = openStore(outside, {
      discardPantin: async () => {
        throw refusal;
      },
    });
    await requestReload(store);
    expect(store.state.message?.level).toBe("error");
  });
});

describe("a save refused with 409", () => {
  it("shows the core's refusal, then the banner from the re-read Pantin", async () => {
    const conflict = new PantinApiError(
      "api",
      "pantin.json was modified outside Pantin since it was opened. Save again to overwrite it, or reload it.",
      "conflict",
      409,
    );
    const { store, calls } = openStore(
      { ...clean, unsavedChanges: true },
      {
        savePantin: async () => {
          throw conflict;
        },
      },
    );
    expect(await savePantin(store)).toBe(false);
    expect(calls).toEqual(["get"]);
    expect(store.state.message?.level).toBe("error");
    expect(store.state.message?.detail).toContain("modified outside Pantin");
    expect(banner(store)?.text).toBe(
      createTranslator("fr")("externalEdit.one", { file: "pantin.json" }),
    );
  });
});

describe("reading the open Pantin again", () => {
  it("is a no-op with no Pantin open", async () => {
    const calls: string[] = [];
    const store = testStore({
      getPantin: async () => {
        calls.push("get");
        return outside;
      },
    });
    await readOpenPantinAgain(store);
    expect(calls).toEqual([]);
  });
});
