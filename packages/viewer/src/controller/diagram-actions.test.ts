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
import { pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { bodyNodeId, jointNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { withRevealedNode } from "../tree/tree-state.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { selectDiagramNode, setDiagramShown, toggleDiagramBand } from "./diagram-actions.ts";
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
  it("shows and hides the diagram, and folds a band and unfolds it", () => {
    const store = openStore();
    setDiagramShown(store, true);
    expect(store.state.diagramShown).toBe(true);
    toggleDiagramBand(store, "main");
    expect([...store.state.collapsedDiagramBands]).toEqual(["main"]);
    toggleDiagramBand(store, "main");
    expect(store.state.collapsedDiagramBands.size).toBe(0);
    setDiagramShown(store, false);
    expect(store.state.diagramShown).toBe(false);
  });

  it("selects the tree row of a joint node", () => {
    const store = openStore();
    selectDiagramNode(store, `joint:${slideJoint.id}`);
    expect(store.state.selectedDevice).toBeNull();
    expect(store.state.selectedNodeId).toBe(
      jointNodeId(pantin.id, slideJoint.id, slideJoint.child),
    );
  });
});

describe("refreshTagValues with the diagram", () => {
  it("reads the tags while the diagram is shown, although no panel and no sensor asks", async () => {
    let reads = 0;
    const store = openStore(async () => {
      reads += 1;
      return { stepCount: 0, tags: [], drives: [] };
    });
    await refreshTagValues(store);
    expect(reads).toBe(0);
    setDiagramShown(store, true);
    await refreshTagValues(store);
    expect(reads).toBe(1);
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
    expect(store.state.selectedDevice).toEqual({ kind, id });
    expect(store.state.selectedNodeId).toBeNull();
    // The bodies moved downstream, or the watched one, are tinted in 3D.
    expect(bodies.at(-1)).toEqual(new Set(["s1"]));
  });

  it("a selection made in the tree or the 3D view replaces the device", () => {
    const store = deviceStore();
    selectDiagramNode(store, "drive:v1");
    store.update(withRevealedNode(store.state, bodyNodeId(withDevices.id, "s1")));
    expect(store.state.selectedDevice).toBeNull();
    expect(store.state.selectedNodeId).toBe(bodyNodeId(withDevices.id, "s1"));
  });

  it("opens a closed inspector, so the left-hand note never points to a hidden panel", () => {
    const store = deviceStore();
    store.update({ ...store.state, inspectorOpen: false });
    selectDiagramNode(store, "drive:v1");
    expect(store.state.inspectorOpen).toBe(true);
  });

  it("ignores a device that is not in the document", () => {
    const store = deviceStore();
    selectDiagramNode(store, "drive:ghost");
    expect(store.state.selectedDevice).toBeNull();
  });

  it("moves the selection to the Pantin when the device is deleted", () => {
    const store = deviceStore();
    selectDiagramNode(store, "actuator:c1");
    const without = { ...withDevices, document: { ...withDevices.document, actuators: [] } };
    store.update(withOpenPantin(store.state, without));
    expect(store.state.selectedDevice).toBeNull();
    expect(store.state.selectedNodeId).toBe(pantinNodeId(withDevices.id));
  });
});

describe("the viewport follows the switch", () => {
  it("renders in 3D and stops rendering while the diagram is shown", () => {
    const calls: boolean[] = [];
    const store = testStore({}, { setRendering: (active: boolean) => calls.push(active) });
    store.requestedPantinId = pantin.id;
    store.update(withOpenPantin(store.state, pantin));
    setDiagramShown(store, true);
    setDiagramShown(store, false);
    expect(calls.slice(-3)).toEqual([true, false, true]);
  });

  it("keeps rendering with no Pantin open, whatever the switch says", () => {
    const calls: boolean[] = [];
    const store = testStore({}, { setRendering: (active: boolean) => calls.push(active) });
    store.update({ ...store.state, diagramShown: true });
    expect(calls).toEqual([true]);
  });
});
