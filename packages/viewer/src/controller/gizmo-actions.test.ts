import type { PantinResponse } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { layoutOf } from "../central-layout.ts";
import { bodyOf, documentOf, jointOf } from "../diagram/diagram-fixtures.ts";
import { DEFAULT_SNAP_STEPS } from "../gizmo/placement-snapping.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { withNode } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, jointNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { toggleAlignment } from "./alignment-actions.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import { toggleInspector } from "./drive-actions.ts";
import { setGizmoStep, toggleGizmo, toggleGizmoSpace, turnToolOff } from "./gizmo-actions.ts";
import { runMenuCommand } from "./menu-commands.ts";

const pantin: PantinResponse = {
  id: "press",
  unsavedChanges: false,
  changedOutside: [],
  document: documentOf({
    assemblies: ["a", "b"],
    bodies: [bodyOf("s1", "a"), bodyOf("s2", "b")],
    joints: [jointOf("j1", "s1")],
  }),
};

function openStore(selected: string | null = assemblyNodeId("press", "a")) {
  const store = testStore({});
  store.requestedPantinId = pantin.id;
  store.update(withNode(withOpenPantin(store.state, pantin), selected));
  return store;
}

describe("gizmo switches", () => {
  it("turns a gizmo on, switches to the other, and off with the same command", () => {
    const store = openStore();
    toggleGizmo(store, "move");
    expect(store.state.gizmoMode).toBe("move");
    toggleGizmo(store, "rotate");
    expect(store.state.gizmoMode).toBe("rotate");
    toggleGizmo(store, "rotate");
    expect(store.state.gizmoMode).toBeNull();
  });

  it("from a body selects its assembly, opens the inspector and unfolds Positionnement", () => {
    const store = openStore(bodyNodeId("press", "s2"));
    store.update({
      ...store.state,
      inspectorOpen: false,
      collapsedPropertyGroups: new Set(["assemblyPlacement", "general"]),
    });
    toggleGizmo(store, "move");
    expect(selectedNodeIdOf(store.state.selection)).toBe(assemblyNodeId("press", "b"));
    expect(store.state).toMatchObject({ gizmoMode: "move", inspectorOpen: true });
    expect([...store.state.collapsedPropertyGroups]).toEqual(["general"]);
    expect(store.state.inspectorFocus).toBeNull();
  });
});

describe("the tool follows the selection", () => {
  it("stays on when another assembly is selected", () => {
    const store = openStore();
    toggleGizmo(store, "rotate");
    createPanelIntents(store).selectNode(assemblyNodeId("press", "b"));
    expect(store.state.gizmoMode).toBe("rotate");
  });

  it("goes off for a joint, the Pantin or nothing, and stays on for a body", () => {
    const store = openStore();
    toggleGizmo(store, "move");
    createPanelIntents(store).selectNode(bodyNodeId("press", "s1"));
    expect(store.state.gizmoMode).toBe("move");
    createPanelIntents(store).selectNode(jointNodeId("press", "j1"));
    expect(store.state.gizmoMode).toBeNull();
    toggleGizmo(store, "move");
    expect(store.state.gizmoMode).toBeNull();
  });

  it("goes off when the inspector closes, and in the diagram layout", () => {
    const store = openStore();
    toggleGizmo(store, "move");
    toggleInspector(store);
    expect(store.state.gizmoMode).toBeNull();
    toggleInspector(store);
    toggleGizmo(store, "move");
    store.update({ ...store.state, centralLayout: layoutOf("diagram") });
    expect(store.state.gizmoMode).toBeNull();
  });

  it("ends with turnToolOff, alignment included", () => {
    const store = openStore();
    toggleAlignment(store);
    turnToolOff(store);
    expect(store.state).toMatchObject({ gizmoMode: null, alignment: null });
  });
});

describe("gizmo steps", () => {
  it("starts from the defaults", () => {
    expect(testStore({}).state.gizmoSteps).toEqual(DEFAULT_SNAP_STEPS);
  });

  it("keeps a typed step in the state and in the browser", () => {
    const stored = vi.fn();
    const store = testStore({}, {}, undefined, { storeGizmoSteps: stored });
    setGizmoStep(store, "rotationDegrees", "5");
    expect(store.state.gizmoSteps).toEqual({ translationMillimetres: 1, rotationDegrees: 5 });
    expect(stored).toHaveBeenCalledWith({ translationMillimetres: 1, rotationDegrees: 5 });
  });

  it("ignores a typed step that is not a positive number", () => {
    const stored = vi.fn();
    const store = testStore({}, {}, undefined, { storeGizmoSteps: stored });
    setGizmoStep(store, "translationMillimetres", "0");
    expect(store.state.gizmoSteps).toEqual(DEFAULT_SNAP_STEPS);
    expect(stored).not.toHaveBeenCalled();
  });
});

describe("gizmo space", () => {
  it("flips between Local and Global and stores the new value", () => {
    const stored = vi.fn();
    const store = testStore({}, {}, undefined, { storeGizmoSpace: stored });
    expect(store.state.gizmoSpace).toBe("local");
    toggleGizmoSpace(store);
    expect(store.state.gizmoSpace).toBe("global");
    expect(stored).toHaveBeenLastCalledWith("global");
    toggleGizmoSpace(store);
    expect(store.state.gizmoSpace).toBe("local");
    expect(stored).toHaveBeenLastCalledWith("local");
  });

  it("is run by the gizmoSpace menu command", () => {
    const stored = vi.fn();
    const store = testStore({}, {}, undefined, { storeGizmoSpace: stored });
    runMenuCommand(store, "gizmoSpace", () => undefined);
    expect(store.state.gizmoSpace).toBe("global");
    expect(stored).toHaveBeenCalledWith("global");
  });
});
