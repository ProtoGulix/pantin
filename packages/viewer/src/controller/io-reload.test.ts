import type { AssemblyDeletion, IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { confirmDeleteAssembly } from "./assembly-actions.ts";
import { testStore } from "./controller-test-helpers.ts";
import { ioIntents } from "./io-actions.ts";
import { confirmDeleteJoint } from "./joint-actions.ts";
import { resolvePrompt } from "./session-actions.ts";

const module = (key: string) => ({
  key,
  port: 1502,
  unitId: 1,
  wordOrder: "low_word_first" as const,
  watchdogMilliseconds: 1000,
  channels: [],
});
const answer = (key: string): IoMappingResponse => ({
  status: "valid",
  mappingId: "id",
  modules: [module(key)],
  problems: [],
  unmappedTags: [],
});

const pantin = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
]);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function ioStore(api: Parameters<typeof testStore>[0], layout: "io" | "3d" = "io") {
  const store = testStore({
    getPantin: async () => ({ ...pantin }),
    listPantins: async () => [],
    ...api,
  });
  store.requestedPantinId = pantin.id;
  store.update({ ...withOpenPantin(store.state, pantin), centralLayout: layout });
  await settle();
  return store;
}

describe("the I/O view after edits", () => {
  it("keeps a renamed module selected", async () => {
    const store = await ioStore({
      getIoMapping: async () => answer("m1"),
      updateIoModule: async () => answer("plc"),
    });
    ioIntents(store).editIoModule("m1", "key", "plc");
    await settle();
    expect(store.state.io.selectedModuleKey).toBe("plc");
  });

  it("reads the mapping again when an edit is refused, so the cell shows the core's value", async () => {
    let reads = 0;
    const store = await ioStore({
      getIoMapping: async () => {
        reads += 1;
        return answer("m1");
      },
      updateIoChannel: async () => {
        throw new Error("409");
      },
    });
    reads = 0;
    const before = store.state.io;
    ioIntents(store).editIoChannel("a.v.x", "variable", "clash");
    await settle();
    expect(reads).toBe(1);
    expect(store.state.io).not.toBe(before);
    expect(store.state.message?.level).toBe("error");
  });

  it("names the field of a bad number and sends nothing", async () => {
    let sent = 0;
    const store = await ioStore({
      getIoMapping: async () => answer("m1"),
      updateIoModule: async () => {
        sent += 1;
        return answer("m1");
      },
    });
    ioIntents(store).editIoModule("m1", "port", "");
    await settle();
    expect(sent).toBe(0);
    expect(store.state.message).toMatchObject({
      key: "message.io.integerExpected",
      parameters: { field: "Port" },
    });
  });
});

describe("the hook after any document change", () => {
  it("reads the mapping after a joint deletion that bypasses editPantin", async () => {
    let reads = 0;
    const store = await ioStore({
      getIoMapping: async () => {
        reads += 1;
        return answer("m1");
      },
      deleteJoint: async () => ({ ...pantin, unsavedChanges: true }),
    });
    reads = 0;
    store.update({ ...store.state, pendingDeleteJointId: slideJoint.id });
    await confirmDeleteJoint(store);
    await settle();
    expect(reads).toBe(1);
  });

  it("does not read while another layout is shown", async () => {
    let reads = 0;
    const store = await ioStore(
      {
        getIoMapping: async () => {
          reads += 1;
          return answer("m1");
        },
      },
      "3d",
    );
    store.update({ ...store.state, openPantin: { ...pantin } });
    await settle();
    expect(reads).toBe(0);
  });
});

const EMPTY_DELETION: AssemblyDeletion = {
  assembly: { key: "main", name: "main" },
  bodies: [],
  joints: [],
  drives: [],
  actuators: [],
  sensors: [],
  belts: [],
  guides: [],
  emitters: [],
  absorbers: [],
  presenceSensors: [],
  descendantAssemblies: [],
  reanchoredAssemblies: [],
  removedTags: [],
  addedTags: [],
};

const countReads = () => {
  const counter = { reads: 0 };
  const getIoMapping = async () => {
    counter.reads += 1;
    return answer("m1");
  };
  return { counter, getIoMapping };
};

describe("the hook after the other deletions", () => {
  it("reads the mapping after an assembly deletion with contents", async () => {
    const { counter, getIoMapping } = countReads();
    const deleted: AssemblyDeletion = { ...EMPTY_DELETION };
    const store = await ioStore({
      getIoMapping,
      deleteAssemblyWithContents: async () => ({
        pantin: { ...pantin, unsavedChanges: true },
        deleted,
        retainedMeshFiles: [],
      }),
    });
    counter.reads = 0;
    store.update({ ...store.state, pendingDeleteAssembly: { key: "main", contents: deleted } });
    await confirmDeleteAssembly(store);
    await settle();
    expect(counter.reads).toBe(1);
  });

  it("reads the mapping after a body deletion", async () => {
    const { counter, getIoMapping } = countReads();
    const store = await ioStore({
      getIoMapping,
      deleteBody: async () => ({ ...pantin, unsavedChanges: true }),
    });
    counter.reads = 0;
    store.update({ ...store.state, pendingDeleteBodyId: railBody.id });
    resolvePrompt(store, "confirmDelete");
    await settle();
    expect(counter.reads).toBe(1);
  });
});

describe("the hook and an I/O edit", () => {
  it("reads once after a document edit, and not at all after an I/O edit", async () => {
    const { counter, getIoMapping } = countReads();
    const store = await ioStore({
      getIoMapping,
      deleteBody: async () => ({ ...pantin, unsavedChanges: true }),
      createIoModule: async () => answer("m1"),
    });
    counter.reads = 0;
    ioIntents(store).addIoModule();
    await settle();
    expect(counter.reads).toBe(0);
    store.update({ ...store.state, pendingDeleteBodyId: railBody.id });
    resolvePrompt(store, "confirmDelete");
    await settle();
    expect(counter.reads).toBe(1);
  });
});
