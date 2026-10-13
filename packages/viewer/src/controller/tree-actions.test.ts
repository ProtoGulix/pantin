import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { bodyOf, documentOf, driveOf } from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildContextMenuView } from "../panel/context-menu-model.ts";
import { deviceRowId, familyNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";

// The rows of devices and their folders in the tree (ADR 0047 point 4).

const pantin: PantinResponse = {
  id: "press",
  unsavedChanges: false,
  document: documentOf({
    assemblies: ["a", "b"],
    bodies: [bodyOf("s1", "a"), bodyOf("s2", "a"), bodyOf("s3", "b")],
    drives: [driveOf("v1", "a")],
  }),
};
const driveRow = deviceRowId("press", "drive", "v1");

function openStore() {
  const frameBodies = vi.fn();
  const store = testStore({}, { frameBodies });
  store.requestedPantinId = pantin.id;
  store.update({ ...withOpenPantin(store.state, pantin), inspectorOpen: false });
  return { store, frameBodies };
}

describe("device rows", () => {
  it("a click selects the device and leaves a closed inspector closed", () => {
    const { store } = openStore();
    createPanelIntents(store).selectNode(driveRow);
    expect(store.state.selection).toEqual({ kind: "drive", id: "v1" });
    expect(store.state.inspectorOpen).toBe(false);
  });

  it("activating the row opens the inspector on the device", () => {
    const { store } = openStore();
    createPanelIntents(store).activateNode(driveRow);
    expect(store.state.selection).toEqual({ kind: "drive", id: "v1" });
    expect(store.state.inspectorOpen).toBe(true);
  });

  it("a right click selects the device and opens its menu", () => {
    const { store } = openStore();
    createPanelIntents(store).openContextMenu(driveRow, 10, 20);
    expect(store.state.selection).toEqual({ kind: "drive", id: "v1" });
    expect(store.state.contextMenu).toEqual({ nodeId: driveRow, x: 10, y: 20 });
    const menu = buildContextMenuView(store.state, createTranslator("en"));
    expect(menu?.entries.map((entry) => entry.action)).toEqual(["editDevice", "deleteDevice"]);
  });

  it("choosing edit opens the drive form in the inspector, as the toolbar does", () => {
    const { store } = openStore();
    const intents = createPanelIntents(store);
    intents.openContextMenu(driveRow, 10, 20);
    intents.runDeviceAction(driveRow, "edit");
    expect(store.state.contextMenu).toBeNull();
    expect(store.state.inspectorOpen).toBe(true);
    expect(store.state.driveForm?.driveId).toBe("v1");
  });

  it("choosing delete asks the core to delete the device, as the toolbar does", () => {
    const deleteDrive = vi.fn().mockResolvedValue(pantin);
    const store = testStore({ deleteDrive });
    store.requestedPantinId = pantin.id;
    store.update(withOpenPantin(store.state, pantin));
    const intents = createPanelIntents(store);
    intents.openContextMenu(driveRow, 10, 20);
    intents.runDeviceAction(driveRow, "delete");
    expect(store.state.contextMenu).toBeNull();
    expect(deleteDrive).toHaveBeenCalledWith("press", "v1");
  });

  it("framing a family folder frames the bodies of its assembly", () => {
    const { store, frameBodies } = openStore();
    createPanelIntents(store).frameNode(familyNodeId("press", "a", "actionChain"));
    expect(frameBodies).toHaveBeenCalledWith(["frame", "s1", "s2"]);
  });
});
