import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { sourceOf } from "../test-fixtures.ts";
import { devicePantin } from "./device-fixtures.ts";
import { assemblyNodeId, deviceRowId, familyNodeId, pantinNodeId } from "./node-ids.ts";
import { buildTree, findNode } from "./tree-model.ts";
import { commandForKey } from "./tree-navigation.ts";
import { flattenTree } from "./tree-rows.ts";
import { nodeExists, withRevealedDevice, type withSelection } from "./tree-state.ts";

// The folders and rows of devices under an assembly (ADR 0047 points 2 to 4).

const translate = createTranslator("en");
const openPantin = devicePantin();
const source = sourceOf({ openPantin });
const main = assemblyNodeId("press", "main");

function view(expanded: string[], selection: Parameters<typeof withSelection>[1] = null) {
  return {
    expandedNodeIds: new Set(expanded),
    selection,
    renamingNodeId: null,
  };
}

describe("the device folders in the tree", () => {
  const tree = buildTree(source, translate);

  it("come last under an assembly, one per family, in the order of the ADR", () => {
    const children = findNode(tree, main)?.children ?? [];
    expect(children.slice(-3).map((node) => [node.id, node.label, node.detail])).toEqual([
      [familyNodeId("press", "main", "actionChain"), "Action chain", "3"],
      [familyNodeId("press", "main", "conveying"), "Conveying", "3"],
      [familyNodeId("press", "main", "productFlow"), "Product flow", "2"],
    ]);
  });

  it("list the devices of a family kind by kind, not renamable", () => {
    const folder = findNode(tree, familyNodeId("press", "main", "conveying"));
    expect(folder?.children.map((node) => node.id)).toEqual([
      deviceRowId("press", "belt", "feed"),
      deviceRowId("press", "guide", "side"),
      deviceRowId("press", "presenceSensor", "cell"),
    ]);
    expect(folder?.children.every((node) => !node.renamable && node.kind === "device")).toBe(true);
  });

  it("leave out a family without an element, and are labelled in French too", () => {
    const withoutProducts = {
      ...openPantin,
      document: { ...openPantin.document, emitters: [], absorbers: [] },
    };
    const french = buildTree(sourceOf({ openPantin: withoutProducts }), createTranslator("fr"));
    const labels = findNode(french, main)
      ?.children.slice(-2)
      .map((node) => node.label);
    expect(labels).toEqual(["Chaîne d'action", "Convoyage"]);
  });
});

describe("the selected row", () => {
  const tree = buildTree(source, translate);
  const belt = deviceRowId("press", "belt", "feed");
  const expanded = [pantinNodeId("press"), main, familyNodeId("press", "main", "conveying")];

  it("is the row of the selected device", () => {
    const rows = flattenTree(tree, view(expanded, { kind: "belt", id: "feed" }));
    expect(rows.filter((row) => row.selected).map((row) => row.id)).toEqual([belt]);
  });

  it("is the next row for an arrow key, as for any other row", () => {
    const rows = flattenTree(tree, view(expanded, { kind: "belt", id: "feed" }));
    expect(commandForKey(rows, belt, "ArrowDown")).toEqual({
      type: "select",
      nodeId: deviceRowId("press", "guide", "side"),
    });
  });
});

describe("revealing a device", () => {
  const state = { ...source, ...view([]) };

  it("selects it and unfolds its assembly and family folder", () => {
    const revealed = withRevealedDevice(state, { kind: "emitter", id: "source" });
    expect(revealed.selection).toEqual({ kind: "emitter", id: "source" });
    expect([...revealed.expandedNodeIds]).toEqual([
      pantinNodeId("press"),
      main,
      familyNodeId("press", "main", "productFlow"),
    ]);
    const rows = flattenTree(buildTree(revealed, translate), revealed);
    expect(rows.find((row) => row.selected)?.id).toBe(deviceRowId("press", "emitter", "source"));
  });

  it("knows which family and device rows exist", () => {
    expect(nodeExists(source, familyNodeId("press", "main", "productFlow"))).toBe(true);
    expect(nodeExists(source, deviceRowId("press", "drive", "valve"))).toBe(true);
    expect(nodeExists(source, deviceRowId("press", "drive", "gone"))).toBe(false);
  });
});
