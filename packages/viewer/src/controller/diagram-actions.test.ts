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
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { bodyNodeId, jointNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { withRevealedNode } from "../tree/tree-state.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import {
  cycleCentralLayout,
  selectDiagramNode,
  setCentralLayout,
  toggleDiagramBand,
} from "./diagram-actions.ts";
import { refreshTagValues } from "./drive-commands.ts";

const pantin = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
]);

function openStore(listTags = async () => ({ stepCount: 0, tags: [], drives: [] })) {
  const store = testStore({ listTags });
  store.requestedPantinId = pantin.id;
  store.update({ ...withOpenPantin(store.state, pantin), inspectorOpen: false });
  return store;
}

describe("the diagram state", () => {
  it("starts in both layouts, and opening a Pantin keeps the chosen one", () => {
    const store = openStore();
    expect(store.state.centralLayout).toBe("both");
    setCentralLayout(store, "diagram");
    store.update(withOpenPantin(store.state, pantin));
    expect(store.state.centralLayout).toBe("diagram");
  });

  it("switches layout, cycles with F4 and remembers each change", () => {
    const stored: string[] = [];
    const store = testStore({}, {}, (layout) => stored.push(layout));
    setCentralLayout(store, "3d");
    // Already there: nothing to remember.
    setCentralLayout(store, "3d");
    cycleCentralLayout(store);
    expect(store.state.centralLayout).toBe("diagram");
    expect(stored).toEqual(["3d", "diagram"]);
  });

  it("folds a band and unfolds it", () => {
    const store = openStore();
    toggleDiagramBand(store, "main");
    expect([...store.state.collapsedDiagramBands]).toEqual(["main"]);
    toggleDiagramBand(store, "main");
    expect(store.state.collapsedDiagramBands.size).toBe(0);
  });

  it("selects the tree row of a joint node", () => {
    const store = openStore();
    selectDiagramNode(store, `joint:${slideJoint.id}`);
    expect(selectedDeviceOf(store.state.selection)).toBeNull();
    expect(selectedNodeIdOf(store.state.selection)).toBe(
      jointNodeId(pantin.id, slideJoint.id, slideJoint.child),
    );
  });
});

describe("refreshTagValues with the diagram", () => {
  it("reads the tags while the diagram is shown, alone or in both layouts, although no panel and no sensor asks", async () => {
    let reads = 0;
    const store = openStore(async () => {
      reads += 1;
      return { stepCount: 0, tags: [], drives: [] };
    });
    setCentralLayout(store, "3d");
    await refreshTagValues(store);
    expect(reads).toBe(0);
    setCentralLayout(store, "diagram");
    await refreshTagValues(store);
    expect(reads).toBe(1);
    // Under the 3D view the diagram is shown too (ADR 0030 point 7).
    setCentralLayout(store, "both");
    await refreshTagValues(store);
    expect(reads).toBe(2);
  });
});

const withDevices: PantinResponse = {
  ...pantin,
  document: documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    joints: [jointOf("j1", "s1")],
    drives: [driveOf("v1", "a")],
    actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
    sensors: [encoderOf("e1", "a", "j1")],
  }),
};

function deviceStore(bodies: ReadonlySet<string>[] = []) {
  const store = testStore(
    {},
    { setSelectedBodies: (ids: ReadonlySet<string>) => bodies.push(ids) },
  );
  store.requestedPantinId = withDevices.id;
  store.update(withOpenPantin(store.state, withDevices));
  return store;
}

describe("selecting a device in the diagram", () => {
  it.each([
    ["drive", "v1"],
    ["actuator", "c1"],
    ["sensor", "e1"],
  ] as const)("a %s node selects that device and no tree row", (kind, id) => {
    const bodies: ReadonlySet<string>[] = [];
    const store = deviceStore(bodies);
    selectDiagramNode(store, `${kind}:${id}`);
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind, id });
    expect(selectedNodeIdOf(store.state.selection)).toBeNull();
    // The bodies moved downstream, or the watched one, are tinted in 3D.
    expect(bodies.at(-1)).toEqual(new Set(["s1"]));
  });

  it("a selection made in the tree or the 3D view replaces the device", () => {
    const store = deviceStore();
    selectDiagramNode(store, "drive:v1");
    store.update(withRevealedNode(store.state, bodyNodeId(withDevices.id, "s1")));
    expect(selectedDeviceOf(store.state.selection)).toBeNull();
    expect(selectedNodeIdOf(store.state.selection)).toBe(bodyNodeId(withDevices.id, "s1"));
  });

  it("opens a closed inspector: it is the only place a device is shown", () => {
    const store = deviceStore();
    store.update({ ...store.state, inspectorOpen: false });
    selectDiagramNode(store, "drive:v1");
    expect(store.state.inspectorOpen).toBe(true);
  });

  it("ignores a device that is not in the document", () => {
    const store = deviceStore();
    selectDiagramNode(store, "drive:ghost");
    expect(selectedDeviceOf(store.state.selection)).toBeNull();
  });

  it("moves the selection to the Pantin when the device is deleted", () => {
    const store = deviceStore();
    selectDiagramNode(store, "actuator:c1");
    const without = { ...withDevices, document: { ...withDevices.document, actuators: [] } };
    store.update(withOpenPantin(store.state, without));
    expect(selectedDeviceOf(store.state.selection)).toBeNull();
    expect(selectedNodeIdOf(store.state.selection)).toBe(pantinNodeId(withDevices.id));
  });
});

describe("the viewport follows the layout", () => {
  function renderCalls(): { calls: boolean[]; store: ReturnType<typeof testStore> } {
    const calls: boolean[] = [];
    const store = testStore({}, { setRendering: (active: boolean) => calls.push(active) });
    return { calls, store };
  }

  it("renders in 3D and in both, and stops only for the diagram alone", () => {
    const { calls, store } = renderCalls();
    store.requestedPantinId = pantin.id;
    store.update(withOpenPantin(store.state, pantin));
    setCentralLayout(store, "diagram");
    setCentralLayout(store, "3d");
    setCentralLayout(store, "diagram");
    setCentralLayout(store, "both");
    expect(calls.slice(-5)).toEqual([true, false, true, false, true]);
  });

  it("keeps rendering with no Pantin open, whatever the layout says", () => {
    const { calls, store } = renderCalls();
    store.update({ ...store.state, centralLayout: "diagram" });
    expect(calls).toEqual([true]);
  });
});
