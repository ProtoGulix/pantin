import { describe, expect, it, vi } from "vitest";
import { createPanelIntents } from "../controller/controller.ts";
import { testStore } from "../controller/controller-test-helpers.ts";
import type { FocusTarget } from "../diagram/diagram-focus.ts";
import { wiringDiagram, wiringDocument } from "../diagram/diagram-wiring-fixtures.ts";
import { selectedDeviceOf } from "../selection.ts";
import { withSelection } from "../tree/tree-state.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { deleteInDiagram } from "./diagram-delete.ts";

// Delete in the diagram (ADR 0030 point 4): the focus comes before the
// selection, so it removes a link or shows a hint, never the selected element.

const port = (nodeId: string, socketId: string): FocusTarget => ({ nodeId, socketId });
const node = (nodeId: string): FocusTarget => ({ nodeId, socketId: null });

function selectedDriveStore() {
  const deleteDrive = vi.fn(async () => wiringPantin);
  const wiringPantin = { id: "press", unsavedChanges: false, document: wiringDocument };
  const updateActuator = vi.fn(async () => {
    throw new Error("The test does not need the core's answer.");
  });
  const store = testStore({
    deleteDrive,
    updateActuator,
    getPantin: async () => wiringPantin,
    listPantins: async () => [],
  });
  store.requestedPantinId = "press";
  store.update(
    withSelection(withOpenPantin(store.state, wiringPantin), { kind: "drive", id: "v1" }),
  );
  return { store, deleteDrive, updateActuator };
}

function deleteAt(target: FocusTarget | null, edgeId: string | null = null) {
  const { store, deleteDrive, updateActuator } = selectedDriveStore();
  const openMenu = vi.fn();
  deleteInDiagram({
    edgeId,
    target,
    diagram: wiringDiagram,
    intents: createPanelIntents(store),
    openMenu,
  });
  return { store, deleteDrive, updateActuator, openMenu };
}

describe("deleteInDiagram with a device selected", () => {
  it("shows the hint on a focused node and keeps the selected device", () => {
    const { store, deleteDrive } = deleteAt(node("drive:v1"));
    expect(deleteDrive).not.toHaveBeenCalled();
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "drive", id: "v1" });
    expect(store.state.message?.key).toBe("diagram.hint.deleteOnPort");
  });

  it("removes the link into a focused port, not the selected drive that feeds it", async () => {
    const { store, deleteDrive, updateActuator } = deleteAt(port("actuator:cyl1", "in:cap"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updateActuator).toHaveBeenCalledOnce();
    expect(deleteDrive).not.toHaveBeenCalled();
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "drive", id: "v1" });
  });

  it("shows the hint on a port with no link", () => {
    const { deleteDrive, store } = deleteAt(port("actuator:cyl2", "in:cap"));
    expect(deleteDrive).not.toHaveBeenCalled();
    expect(store.state.message?.key).toBe("diagram.hint.deleteOnPort");
  });
});
