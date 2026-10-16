import type { AssemblyDeletion, IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { railBody, slideJoint } from "../test-fixtures.ts";
import { confirmDeleteAssembly } from "./assembly-actions.ts";
import { testStore } from "./controller-test-helpers.ts";
import { ioIntents } from "./io-actions.ts";
import { answer, ioStore, pantin, settle } from "./io-reload-test-helpers.ts";
import { confirmDeleteJoint } from "./joint-actions.ts";
import { resolvePrompt } from "./session-actions.ts";

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

  it("reads once when a Pantin opens, not at each selection or inspector opening", async () => {
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
    expect(reads).toBe(1);
    store.update({ ...store.state, inspectorOpen: true, selection: { kind: "drive", id: "d1" } });
    await settle();
    store.update({ ...store.state, selection: { kind: "sensor", id: "s1" } });
    await settle();
    expect(reads).toBe(1);
  });
});

describe("the mapping read for the bridge block", () => {
  it("reads the mapping of an open Pantin, in the 3D layout too", async () => {
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
    expect(reads).toBe(1);
    expect(store.state.io.mapping?.modules[0]?.key).toBe("m1");
  });

  it("reads nothing while no Pantin is open", async () => {
    let reads = 0;
    testStore({
      getIoMapping: async () => {
        reads += 1;
        return answer("m1");
      },
    });
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

describe("one read at a time, and the freshest answer wins", () => {
  it("skips the read when the mapping is current, whatever the selection", async () => {
    const { counter, getIoMapping } = countReads();
    const store = await ioStore({ getIoMapping });
    counter.reads = 0;
    store.update({ ...store.state, inspectorOpen: true });
    store.update({ ...store.state, selection: { kind: "drive", id: "d1" } });
    store.update({ ...store.state, selection: { kind: "sensor", id: "s1" } });
    await settle();
    expect(counter.reads).toBe(0);
  });

  it("drops a late read that a fresher edit answer has overtaken", async () => {
    let release: (mapping: IoMappingResponse) => void = () => undefined;
    const store = await ioStore({
      getIoMapping: () => new Promise((resolve) => (release = resolve)),
      createIoModule: async () => answer("edited"),
    });
    // A new document version while the I/O view is shown starts a read that stays pending.
    store.update({ ...store.state, openPantin: { ...pantin } });
    ioIntents(store).addIoModule();
    await settle();
    expect(store.state.io.mapping?.modules[0]?.key).toBe("edited");
    release(answer("late"));
    await settle();
    expect(store.state.io.mapping?.modules[0]?.key).toBe("edited");
  });
});
