import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { layoutOf } from "../central-layout.ts";
import { bodyOf, documentOf, driveOf, jointOf } from "../diagram/diagram-fixtures.ts";
import { unmappedEntryId } from "../io/io-element-tags.ts";
import { deviceRowId, familyNodeId, jointNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";

// The links between the I/O view and the tree (ADR 0049 point 11).

const pantin = {
  id: "press",
  unsavedChanges: false,
  document: documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    joints: [jointOf("j1", "s1")],
    drives: [driveOf("v1", "a"), driveOf("v2", "a")],
  }),
};

const channel = (tag: string, owner: IoMappingResponse["modules"][0]["channels"][0]["owner"]) => ({
  tag,
  variable: `GVL.${tag}`,
  zone: "coil" as const,
  address: 0,
  ioType: "BOOL" as const,
  comment: "",
  tagType: "bit" as const,
  direction: "command" as const,
  owner,
});
const module = (key: string, channels: ReturnType<typeof channel>[]) => ({
  key,
  port: 1502,
  unitId: 1,
  wordOrder: "low_word_first" as const,
  watchdogMilliseconds: 1000,
  channels,
});
const mapping: IoMappingResponse = {
  status: "valid",
  mappingId: "id",
  modules: [module("m1", []), module("m2", [channel("a.v1.extend", { kind: "drive", id: "v1" })])],
  problems: [],
  unmappedTags: [
    { name: "a.v2.extend", type: "bit", direction: "command", owner: { kind: "drive", id: "v2" } },
  ],
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function ioStore() {
  const store = testStore({ getIoMapping: async () => mapping });
  store.requestedPantinId = pantin.id;
  store.update({
    ...withOpenPantin(store.state, pantin),
    centralLayout: layoutOf("io"),
    inspectorOpen: false,
  });
  await settle();
  return store;
}

describe("a clicked tag selects its owner", () => {
  it("selects a device, unfolds the tree to its row and stays on the I/O view", async () => {
    const store = await ioStore();
    createPanelIntents(store).selectIoOwner({ kind: "drive", id: "v1" });
    expect(store.state.selection).toEqual({ kind: "drive", id: "v1" });
    expect(store.state.expandedNodeIds.has(familyNodeId("press", "a", "actionChain"))).toBe(true);
    expect(store.state.centralLayout.top).toBe("io");
    expect(store.state.inspectorOpen).toBe(true);
  });

  it("selects the tree node of a joint", async () => {
    const store = await ioStore();
    createPanelIntents(store).selectIoOwner({ kind: "joint", id: "j1" });
    expect(store.state.selection).toEqual({ kind: "node", nodeId: jointNodeId("press", "j1") });
  });

  it("ignores an owner the document no longer has", async () => {
    const store = await ioStore();
    const before = store.state.selection;
    createPanelIntents(store).selectIoOwner({ kind: "drive", id: "gone" });
    expect(store.state.selection).toBe(before);
  });
});

// A store whose view never visited the I/O layout, so no mapping is loaded.
function quietStore(reads: { count: number }, answer: IoMappingResponse = mapping) {
  const store = testStore({
    getIoMapping: async () => {
      reads.count += 1;
      return answer;
    },
  });
  store.requestedPantinId = pantin.id;
  store.update({
    ...withOpenPantin(store.state, pantin),
    centralLayout: layoutOf("3d"),
    inspectorOpen: false,
  });
  return store;
}

describe("showing an element in the I/O view", () => {
  it("opens the module and the cell of a mapped tag from the inspector", async () => {
    const store = await ioStore();
    const intents = createPanelIntents(store);
    intents.selectDevice({ kind: "drive", id: "v1" });
    store.update({ ...store.state, centralLayout: layoutOf("3d") });
    intents.showTagInIo("a.v1.extend");
    await settle();
    expect(store.state.centralLayout.top).toBe("io");
    expect(store.state.io.selectedModuleKey).toBe("m2");
    expect(store.state.io.focus).toEqual({ cellId: "io-cell-1-0-tag", serial: 1 });
  });

  it("reads the mapping first when none was loaded, then lands on the first mapped tag", async () => {
    const reads = { count: 0 };
    const store = quietStore(reads);
    createPanelIntents(store).showDeviceInIo(deviceRowId("press", "drive", "v1"));
    await settle();
    expect(reads.count).toBe(1);
    expect(store.state.io.selectedModuleKey).toBe("m2");
    expect(store.state.io.focus?.cellId).toBe("io-cell-1-0-tag");
  });

  it("opens on the unmapped list when no tag of the device is mapped", async () => {
    const store = quietStore({ count: 0 });
    createPanelIntents(store).showDeviceInIo(deviceRowId("press", "drive", "v2"));
    await settle();
    expect(store.state.centralLayout.top).toBe("io");
    expect(store.state.io.focus?.cellId).toBe(unmappedEntryId("a.v2.extend"));
  });

  it("reads again when the document changed since the mapping was read", async () => {
    const reads = { count: 0 };
    const store = quietStore(reads);
    createPanelIntents(store).showDeviceInIo(deviceRowId("press", "drive", "v1"));
    await settle();
    // The document change itself starts the read; "Show in I/O" shares it.
    reads.count = 0;
    store.update({ ...store.state, centralLayout: layoutOf("3d"), openPantin: { ...pantin } });
    createPanelIntents(store).showDeviceInIo(deviceRowId("press", "drive", "v2"));
    await settle();
    expect(reads.count).toBe(1);
    expect(store.state.io.focus?.cellId).toBe(unmappedEntryId("a.v2.extend"));
  });
});

describe('the mapping behind "Show in I/O"', () => {
  it("does not use the mapping of another Pantin", async () => {
    const reads = { count: 0 };
    const store = quietStore(reads);
    createPanelIntents(store).showDeviceInIo(deviceRowId("press", "drive", "v1"));
    await settle();
    const other = { ...pantin, id: "other" };
    store.requestedPantinId = other.id;
    reads.count = 0;
    store.update({ ...withOpenPantin(store.state, other), centralLayout: layoutOf("3d") });
    expect(store.state.io.mapping).toBeNull();
    createPanelIntents(store).showDeviceInIo(deviceRowId("other", "drive", "v1"));
    await settle();
    expect(reads.count).toBe(1);
  });

  it("does not count its read as a pending request", async () => {
    let release: () => void = () => undefined;
    const store = testStore({
      getIoMapping: () => new Promise((resolve) => (release = () => resolve(mapping))),
    });
    store.requestedPantinId = pantin.id;
    store.update({ ...withOpenPantin(store.state, pantin), centralLayout: layoutOf("io") });
    expect(store.state.pendingRequestCount).toBe(0);
    release();
    await settle();
    expect(store.state.io.mapping).toEqual(mapping);
  });
});
