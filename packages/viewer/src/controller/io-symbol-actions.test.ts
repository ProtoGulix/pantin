import type { ApplyIoVariablesRequest, ApplyIoVariablesResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { createTranslator } from "../i18n/translate.ts";
import { symbolRowKey } from "../io/symbol-import-rows.ts";
import {
  INCOMPATIBLE,
  SURE_ONE,
  SURE_TWO,
  SYMBOL_PREVIEW,
  TO_CHECK,
} from "../io/symbol-import-test-fixtures.ts";
import { buildSymbolImportView } from "../io/symbol-import-view.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { symbolImportIntents } from "./io-symbol-actions.ts";

const pantin = pantinResponse(false, [], "press", []);
const file = new File(["<xml/>"], "symbols.xml", { type: "text/xml" });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const mapping = {
  status: "valid" as const,
  mappingId: "id",
  modules: [],
  problems: [],
  unmappedTags: [],
};

interface Spy {
  previews: string[];
  applies: ApplyIoVariablesRequest[];
}

function openStore(overrides: { previewFails?: PantinApiError } = {}) {
  const spy: Spy = { previews: [], applies: [] };
  const store = testStore({
    getPantin: async () => ({ ...pantin, unsavedChanges: true }),
    listPantins: async () => [],
    previewIoSymbols: async (_id, sent) => {
      spy.previews.push((sent as File).name);
      if (overrides.previewFails !== undefined) {
        throw overrides.previewFails;
      }
      return SYMBOL_PREVIEW;
    },
    applyIoVariables: async (_id, request): Promise<ApplyIoVariablesResponse> => {
      spy.applies.push(request);
      return { ...mapping, applied: request.assignments, skipped: [] };
    },
  });
  store.requestedPantinId = pantin.id;
  store.update(withOpenPantin(store.state, pantin));
  return { store, spy, intents: symbolImportIntents(store) };
}

describe("the PLC symbol import actions", () => {
  it("shows the core's preview with the sure matches checked, and changes nothing", async () => {
    const { store, spy, intents } = openStore();
    intents.importIoSymbols(file);
    await settle();
    expect(spy.previews).toEqual(["symbols.xml"]);
    expect(spy.applies).toEqual([]);
    const state = store.state.symbolImport;
    expect(state.status === "ready" && [...state.checked]).toEqual([
      symbolRowKey(SURE_ONE),
      symbolRowKey(SURE_TWO),
    ]);
  });

  it("sends exactly the checked rows and the picker choices on Apply", async () => {
    const { store, spy, intents } = openStore();
    intents.importIoSymbols(file);
    await settle();
    intents.toggleSymbolRow(symbolRowKey(SURE_ONE));
    intents.toggleSymbolRow(symbolRowKey(TO_CHECK));
    intents.toggleSymbolRow(symbolRowKey(INCOMPATIBLE));
    intents.pickSymbol(symbolRowKey({ module: "m1", tag: "main.rod.home" }), "GVL.spare_input");
    intents.applySymbolImport();
    await settle();
    expect(spy.applies).toEqual([
      {
        assignments: [
          { module: "m1", tag: "main.valve.retract", variable: "GVL.valve_retract" },
          { module: "m1", tag: "main.rod.position", variable: "GVL.rod_position" },
          { module: "m1", tag: "main.rod.home", variable: "GVL.spare_input" },
        ],
      },
    ]);
    expect(store.state.io.mapping).toEqual(mapping);
    expect(store.state.openPantin?.unsavedChanges).toBe(true);
    expect(store.state.symbolImport).toMatchObject({ status: "done", appliedCount: 3 });
  });

  it("sends nothing on Cancel, before or after the preview", async () => {
    const { store, spy, intents } = openStore();
    intents.importIoSymbols(file);
    await settle();
    intents.closeSymbolImport();
    intents.applySymbolImport();
    await settle();
    expect(spy.applies).toEqual([]);
    expect(store.state.symbolImport.status).toBe("closed");
  });

  it("does not apply when no row is checked", async () => {
    const { spy, intents } = openStore();
    intents.importIoSymbols(file);
    await settle();
    intents.toggleSymbolRow(symbolRowKey(SURE_ONE));
    intents.toggleSymbolRow(symbolRowKey(SURE_TWO));
    intents.applySymbolImport();
    await settle();
    expect(spy.applies).toEqual([]);
  });

  it("keeps the choices and says why when the core refuses the batch", async () => {
    const { store, intents } = openStore();
    store.ports.api.applyIoVariables = async () => {
      throw new PantinApiError("api", "The mapping is read-only.", "conflict", 409);
    };
    intents.importIoSymbols(file);
    await settle();
    intents.applySymbolImport();
    await settle();
    const state = store.state.symbolImport;
    expect(state.status === "ready" && state.applying).toBe(false);
    const view = buildSymbolImportView(state, createTranslator("en"));
    expect(view.status).toBe("ready");
    expect(view.statusText).toContain("Apply refused.");
    expect(view.detail).toBe("The mapping is read-only.");
    expect(view.applyEnabled).toBe(true);
  });
});

describe("the errors of the symbol import", () => {
  it("shows the core's refusal of the file in the dialog, with its detail", async () => {
    const refusal = new PantinApiError(
      "api",
      "The file has a control character at line 3: export it again as UTF-8 text.",
      "invalid_request",
      400,
    );
    const { store, intents } = openStore({ previewFails: refusal });
    intents.importIoSymbols(file);
    await settle();
    const view = buildSymbolImportView(store.state.symbolImport, createTranslator("en"));
    expect(view.status).toBe("failed");
    expect(view.statusText).toContain("Import failed.");
    expect(view.detail).toBe(refusal.message);
    expect(view.sections).toEqual([]);
  });

  it("refuses a file over the limit before sending it, and says how to fix it", async () => {
    const { store, spy, intents } = openStore();
    const huge = new File(["x"], "huge.xml");
    Object.defineProperty(huge, "size", { value: 9 * 1024 * 1024 });
    intents.importIoSymbols(huge);
    await settle();
    expect(spy.previews).toEqual([]);
    const view = buildSymbolImportView(store.state.symbolImport, createTranslator("en"));
    expect(view.statusText).toContain("larger than 8 MiB");
    expect(view.statusText).toContain("select fewer variables");
  });
});

describe("the apply of the symbol import, when things go wrong around it", () => {
  it("stays closed when the user cancels during the apply and the core then refuses", async () => {
    const { store, intents } = openStore();
    let refuse: () => void = () => undefined;
    store.ports.api.applyIoVariables = () =>
      new Promise((_resolve, reject) => {
        refuse = () => reject(new PantinApiError("api", "Refused.", "conflict", 409));
      });
    intents.importIoSymbols(file);
    await settle();
    intents.applySymbolImport();
    intents.closeSymbolImport();
    refuse();
    await settle();
    expect(store.state.symbolImport.status).toBe("closed");
  });

  it("stays closed when the user cancels during the apply and the core then accepts", async () => {
    const { store, intents } = openStore();
    let accept: () => void = () => undefined;
    store.ports.api.applyIoVariables = (_id, request) =>
      new Promise((resolve) => {
        accept = () => resolve({ ...mapping, applied: request.assignments, skipped: [] });
      });
    intents.importIoSymbols(file);
    await settle();
    intents.applySymbolImport();
    intents.closeSymbolImport();
    accept();
    await settle();
    expect(store.state.symbolImport.status).toBe("closed");
  });
});

describe("the apply of the symbol import, when things go wrong after it", () => {
  it("stays closed when the user cancels during the refresh that follows the apply", async () => {
    const { store, intents } = openStore();
    const reload = store.ports.api.getPantin;
    let refreshed: () => void = () => undefined;
    store.ports.api.getPantin = (id) =>
      new Promise((resolve) => {
        refreshed = () => resolve(reload(id));
      });
    intents.importIoSymbols(file);
    await settle();
    intents.applySymbolImport();
    await settle();
    intents.closeSymbolImport();
    refreshed();
    await settle();
    expect(store.state.symbolImport.status).toBe("closed");
    expect(store.state.pendingRequestCount).toBe(0);
  });

  it("says done, not refused, when the apply worked and the refresh of the Pantin fails", async () => {
    const { store, intents } = openStore();
    store.ports.api.getPantin = async () => {
      throw new PantinApiError("network", "Cannot reach the core.", null, null);
    };
    intents.importIoSymbols(file);
    await settle();
    intents.applySymbolImport();
    await settle();
    expect(store.state.symbolImport).toMatchObject({ status: "done", appliedCount: 2 });
    expect(store.state.message?.key).toBe("error.network");
  });

  it("does not leave Apply greyed when another Pantin was opened during the apply", async () => {
    const { store, intents } = openStore();
    intents.importIoSymbols(file);
    await settle();
    intents.applySymbolImport();
    store.requestedPantinId = "another";
    await settle();
    expect(store.state.symbolImport.status).toBe("closed");
  });
});
