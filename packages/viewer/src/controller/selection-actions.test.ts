import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "../diagram/diagram-fixtures.ts";
import { selectedDeviceOf, selectedNodeIdOf } from "../selection.ts";
import { assemblyNodeId, bodyNodeId, jointNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { createPanelIntents, selectBodyFromViewport } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import { selectDevice } from "./diagram-actions.ts";
import { toggleInspector } from "./drive-actions.ts";
import { openJointEditForm, openJointForm } from "./joint-actions.ts";

// The one selection (a tree node or a device) set from each source, and what
// each does to the inspector (ADR 0030 point 2): only a device opens it.

const pantin: PantinResponse = {
  id: "press",
  unsavedChanges: false,
  document: documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    joints: [jointOf("j1", "s1")],
    drives: [driveOf("v1", "a")],
    actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
    sensors: [encoderOf("e1", "a", "j1")],
  }),
};

function storeWithInspector(open: boolean) {
  const store = testStore({});
  store.requestedPantinId = pantin.id;
  store.update({ ...withOpenPantin(store.state, pantin), inspectorOpen: open });
  return store;
}

describe("selection from each source", () => {
  it("a tree row selects a node, and leaves a closed inspector closed", () => {
    const store = storeWithInspector(false);
    createPanelIntents(store).selectNode(jointNodeId("press", "j1"));
    expect(store.state.selection).toEqual({ kind: "node", nodeId: jointNodeId("press", "j1") });
    expect(store.state.inspectorOpen).toBe(false);
  });

  it("a body picked in the 3D view selects its assembly, a double click the body, and leave a closed inspector closed", () => {
    const store = storeWithInspector(false);
    selectBodyFromViewport(store, "s1", false);
    expect(selectedNodeIdOf(store.state.selection)).toBe(assemblyNodeId("press", "a"));
    selectBodyFromViewport(store, "s1", true);
    expect(selectedNodeIdOf(store.state.selection)).toBe(bodyNodeId("press", "s1"));
    expect(store.state.inspectorOpen).toBe(false);
  });

  it("a click on nothing in the 3D view selects nothing", () => {
    const store = storeWithInspector(true);
    selectBodyFromViewport(store, null, false);
    expect(store.state.selection).toBeNull();
  });

  it("a device from the diagram or an index opens a closed inspector", () => {
    const store = storeWithInspector(false);
    selectDevice(store, { kind: "sensor", id: "e1" });
    expect(store.state.selection).toEqual({ kind: "sensor", id: "e1" });
    expect(store.state.inspectorOpen).toBe(true);
  });

  it("replaces a device by a node and a node by a device, never both", () => {
    const store = storeWithInspector(true);
    selectDevice(store, { kind: "drive", id: "v1" });
    createPanelIntents(store).selectNode(bodyNodeId("press", "s1"));
    expect([
      selectedDeviceOf(store.state.selection),
      selectedNodeIdOf(store.state.selection),
    ]).toEqual([null, bodyNodeId("press", "s1")]);
    selectDevice(store, { kind: "actuator", id: "c1" });
    expect([
      selectedDeviceOf(store.state.selection),
      selectedNodeIdOf(store.state.selection),
    ]).toEqual([{ kind: "actuator", id: "c1" }, null]);
  });
});

describe("the joint form lives in the inspector", () => {
  it("opens the inspector with a new joint form, and with the type change form", () => {
    const store = storeWithInspector(false);
    openJointForm(store);
    expect(store.state.jointForm).not.toBeNull();
    expect(store.state.inspectorOpen).toBe(true);
    store.update({ ...store.state, jointForm: null, inspectorOpen: false });
    openJointEditForm(store, jointNodeId("press", "j1"));
    expect(store.state.jointForm?.jointId).toBe("j1");
    expect(store.state.inspectorOpen).toBe(true);
  });

  it("drops the form with the inspector, so no hidden form keeps previewing", () => {
    const store = storeWithInspector(true);
    openJointForm(store);
    toggleInspector(store);
    expect(store.state.inspectorOpen).toBe(false);
    expect(store.state.jointForm).toBeNull();
  });
});
