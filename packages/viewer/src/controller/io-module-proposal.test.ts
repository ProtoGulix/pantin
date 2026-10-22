import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { createTranslator } from "../i18n/translate.ts";
import { SYMBOL_PREVIEW } from "../io/symbol-import-test-fixtures.ts";
import { buildSymbolImportView } from "../io/symbol-import-view.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { symbolImportIntents } from "./io-symbol-actions.ts";

// The NodeId prefix proposal of the symbol import (ADR 0065 point 12).

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

describe("the module proposal of the symbol import", () => {
  const proposed = {
    ...SYMBOL_PREVIEW,
    moduleProposals: [
      {
        module: "plc",
        nodeIdPrefix: "|var|PLC.Application.",
        reason: "from_project_info" as const,
      },
    ],
  };

  function proposalStore(fails: boolean) {
    const patches: unknown[] = [];
    const store = testStore({
      getPantin: async () => ({ ...pantin, unsavedChanges: true }),
      listPantins: async () => [],
      previewIoSymbols: async () => proposed,
      updateIoModule: async (_id, moduleKey, request) => {
        patches.push([moduleKey, request]);
        if (fails) {
          throw new PantinApiError("api", "No such module.", "not_found", 404);
        }
        return mapping;
      },
    });
    store.requestedPantinId = pantin.id;
    store.update(withOpenPantin(store.state, pantin));
    return { store, patches, intents: symbolImportIntents(store) };
  }

  it("sends only the NodeId prefix of that module, apart from the variables, then drops it", async () => {
    const { store, patches, intents } = proposalStore(false);
    intents.importIoSymbols(file);
    await settle();
    intents.applyModuleProposal("plc");
    await settle();
    expect(patches).toEqual([
      ["plc", { transport: { kind: "opcua_client", nodeIdPrefix: "|var|PLC.Application." } }],
    ]);
    const state = store.state.symbolImport;
    expect(state.status === "ready" && state.preview.moduleProposals).toEqual([]);
    expect(store.state.openPantin?.unsavedChanges).toBe(true);
  });

  it("keeps the proposal and says why when the core refuses", async () => {
    const { store, intents } = proposalStore(true);
    intents.importIoSymbols(file);
    await settle();
    intents.applyModuleProposal("plc");
    await settle();
    const view = buildSymbolImportView(store.state.symbolImport, createTranslator("en"));
    expect(view.moduleProposals?.proposals).toHaveLength(1);
    expect(view.moduleProposals?.errorText).toContain("refused");
  });
});
