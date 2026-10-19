import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { layoutOf } from "../central-layout.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { setCentralLayout } from "./diagram-actions.ts";
import { ioIntents } from "./io-actions.ts";
import { editPantin } from "./pantin-actions.ts";

const mapping: IoMappingResponse = {
  status: "valid",
  mappingId: "id",
  modules: [
    {
      key: "m1",
      port: 1502,
      unitId: 1,
      wordOrder: "low_word_first",
      watchdogMilliseconds: 1000,
      channels: [],
    },
  ],
  problems: [],
  unmappedTags: [],
};
const pantin = pantinResponse(false, [], "press", []);
const edited = { ...pantin, unsavedChanges: true };

function openStore(calls: string[]) {
  let current = pantin;
  const store = testStore({
    getPantin: async () => ({ ...current }),
    listPantins: async () => [],
    getIoMapping: async () => {
      calls.push("get");
      return mapping;
    },
    createIoModule: async () => {
      calls.push("create");
      current = edited;
      return mapping;
    },
    createIoChannels: async (_id, moduleKey, request) => {
      calls.push(`map ${moduleKey} ${request.tags.join(",")}`);
      return mapping;
    },
    updateIoChannel: async (_id, tag, request) => {
      calls.push(`patch ${tag} ${JSON.stringify(request)}`);
      return mapping;
    },
  });
  store.requestedPantinId = pantin.id;
  store.update(withOpenPantin(store.state, pantin));
  // Opening a Pantin reads the mapping for the inspector; the tests count what they cause.
  calls.length = 0;
  return store;
}

describe("the I/O view actions", () => {
  it("has read the mapping once a Pantin is open, and does not read again for the I/O layout", async () => {
    const calls: string[] = [];
    const store = openStore(calls);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.state.io.mapping).toEqual(mapping);
    expect(store.state.io.selectedModuleKey).toBe("m1");
    setCentralLayout(store, layoutOf("io"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([]);
  });

  it("shows the route answer and the Pantin's unsaved changes after an edit", async () => {
    const calls: string[] = [];
    const store = openStore(calls);
    ioIntents(store).addIoModule();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["create"]);
    expect(store.state.io.mapping).toEqual(mapping);
    expect(store.state.openPantin?.unsavedChanges).toBe(true);
  });

  it("sends one request for every tag of Map all", async () => {
    const calls: string[] = [];
    const store = openStore(calls);
    ioIntents(store).mapIoTags("m1", ["a.v.x", "a.v.y"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["map m1 a.v.x,a.v.y"]);
  });

  it("reassigns with a PATCH that carries the tag and sends typed addresses as numbers", async () => {
    const calls: string[] = [];
    const store = openStore(calls);
    ioIntents(store).reassignIoChannel("a.v.x");
    ioIntents(store).editIoChannel("a.v.x", "address", "4");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.sort()).toEqual(['patch a.v.x {"address":4}', 'patch a.v.x {"tag":"a.v.x"}']);
  });
});

describe("the I/O view selection and reloads", () => {
  it("asks to focus the cell of a problem and selects its module", () => {
    const store = openStore([]);
    ioIntents(store).focusIoProblem("m2", "io-cell-1-port");
    ioIntents(store).focusIoProblem(null, "io-cell-1-port");
    expect(store.state.io.selectedModuleKey).toBe("m2");
    expect(store.state.io.focus).toEqual({ cellId: "io-cell-1-port", serial: 2 });
  });

  it("reads the mapping again after a document edit, whatever the layout", async () => {
    const calls: string[] = [];
    const store = openStore(calls);
    await new Promise((resolve) => setTimeout(resolve, 0));
    calls.length = 0;
    await editPantin(store, pantin.id, async () => "done");
    expect(calls).toEqual(["get"]);
  });
});

describe("the GVL export", () => {
  it("hands the file the core generated to the browser", async () => {
    const saved: string[] = [];
    const store = testStore(
      { fetchIoGvl: async () => ({ fileName: "press.gvl", text: "VAR_GLOBAL" }) },
      {},
      undefined,
      { saveTextFile: (name, text) => saved.push(`${name}:${text}`) },
    );
    store.update(withOpenPantin(store.state, pantin));
    ioIntents(store).exportIoGvl();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saved).toEqual(["press.gvl:VAR_GLOBAL"]);
    expect(store.state.message).toBeNull();
  });

  it("shows the core's refusal with its problems and saves nothing", async () => {
    const saved: string[] = [];
    const store = testStore(
      {
        fetchIoGvl: async () => {
          throw new PantinApiError("api", "The mapping is invalid: overlap", "conflict", 409);
        },
      },
      {},
      undefined,
      { saveTextFile: (name) => saved.push(name) },
    );
    store.update(withOpenPantin(store.state, pantin));
    ioIntents(store).exportIoGvl();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saved).toEqual([]);
    expect([store.state.message?.key, store.state.message?.detail]).toEqual([
      "error.code.conflict",
      "The mapping is invalid: overlap",
    ]);
  });
});
