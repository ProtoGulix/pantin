import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { hingeJoint, pantinResponse, railBody, slideJoint } from "../test-fixtures.ts";
import {
  bodyIdOfNode,
  bodyNodeId,
  folderNodeId,
  jointNodeId,
  pantinNodeId,
  parseNodeId,
  sourceNodeNodeId,
} from "./node-ids.ts";
import { buildTree, findNode, flattenTree, type TreeViewState } from "./tree-model.ts";

const translate = createTranslator("fr");
const source = { openPantin: pantinResponse(false) };

function view(expanded: string[], selected: string | null = null): TreeViewState {
  return { expandedNodeIds: new Set(expanded), selectedNodeId: selected, renamingNodeId: null };
}

const openAndBodiesExpanded = [pantinNodeId("press"), folderNodeId("press", "bodies")];

describe("node ids", () => {
  it.each([
    pantinNodeId("press"),
    folderNodeId("press", "bodies"),
    bodyNodeId("press", "rail"),
    jointNodeId("press", "hinge"),
    folderNodeId("press", "joints"),
    sourceNodeNodeId("press", "rail", 1),
  ])("round trips %s", (nodeId) => {
    expect(parseNodeId(nodeId)).not.toBeNull();
  });

  it.each([
    "",
    "pantin:",
    "body:press",
    "source:press:rail:x",
    "folder:press:drives",
    "pantin:a:b",
  ])("refuses %s", (nodeId) => {
    expect(parseNodeId(nodeId)).toBeNull();
  });

  it("finds the body of a body or source node only", () => {
    expect(bodyIdOfNode(sourceNodeNodeId("press", "rail", 0))).toBe("rail");
    expect(bodyIdOfNode(pantinNodeId("press"))).toBeNull();
  });
});

describe("buildTree", () => {
  const tree = buildTree(source, translate);

  it("has no root in the list view, when no Pantin is open", () => {
    expect(buildTree({ openPantin: null }, translate)).toEqual([]);
  });

  it("starts at the open Pantin, with its body count", () => {
    expect(tree.map((node) => [node.label, node.detail])).toEqual([["Press", "1 corps"]]);
  });

  it("puts the Corps and Liaisons folders under the Pantin", () => {
    expect(tree[0]?.children.map((node) => node.label)).toEqual(["Corps", "Liaisons"]);
  });

  it("puts the bodies in the Corps folder with an icon per source format", () => {
    const body = findNode(tree, bodyNodeId("press", "rail"));
    expect(body).toMatchObject({ label: "Linear rail", icon: "body-glb", renamable: true });
  });

  it("keeps the verbatim source node names as greyed, read-only children", () => {
    const body = findNode(tree, bodyNodeId("press", "rail"));
    expect(
      body?.children.map((node) => [node.label, node.detail, node.muted, node.renamable]),
    ).toEqual([
      ["3630.00.0800N_0", "0/0", true, false],
      ["(nœud sans nom)", "0/1", true, false],
    ]);
  });
});

describe("joints folder", () => {
  const withJoints = buildTree(
    { openPantin: pantinResponse(false, [railBody], "press", [hingeJoint, slideJoint]) },
    translate,
  );

  it("comes after the bodies, with the number of joints", () => {
    expect(withJoints[0]?.children.map((node) => [node.label, node.detail])).toEqual([
      ["Corps", "1"],
      ["Liaisons", "2"],
    ]);
  });

  it("lists each joint with its type, read-only", () => {
    const joint = findNode(withJoints, jointNodeId("press", "hinge"));
    expect(joint).toMatchObject({
      kind: "joint",
      icon: "joint",
      label: "Hinge",
      detail: "Pivot limité",
      renamable: false,
    });
  });

  it("shows joints when the folder is expanded", () => {
    const rows = flattenTree(
      withJoints,
      view([...openAndBodiesExpanded, folderNodeId("press", "joints")]),
    );
    expect(rows.map((row) => row.label)).toEqual([
      "Press",
      "Corps",
      "Linear rail",
      "Liaisons",
      "Hinge",
      "Slide",
    ]);
  });
});

describe("flattenTree", () => {
  const tree = buildTree(source, translate);

  it("shows only the Pantin when nothing is expanded", () => {
    const rows = flattenTree(tree, view([]));
    expect(rows.map((row) => [row.id, row.expandable, row.expanded])).toEqual([
      [pantinNodeId("press"), true, false],
    ]);
  });

  it("walks expanded nodes depth first, with levels, parents and set positions", () => {
    const rows = flattenTree(tree, view([...openAndBodiesExpanded, bodyNodeId("press", "rail")]));
    expect(rows.map((row) => [row.depth, row.label, row.parentId])).toEqual([
      [0, "Press", null],
      [1, "Corps", pantinNodeId("press")],
      [2, "Linear rail", folderNodeId("press", "bodies")],
      [3, "3630.00.0800N_0", bodyNodeId("press", "rail")],
      [3, "(nœud sans nom)", bodyNodeId("press", "rail")],
      [1, "Liaisons", pantinNodeId("press")],
    ]);
    expect(rows[4]).toMatchObject({ positionInSet: 2, setSize: 2, expandable: false });
  });

  it("marks the selected and renaming rows", () => {
    const rows = flattenTree(tree, {
      ...view(openAndBodiesExpanded, bodyNodeId("press", "rail")),
      renamingNodeId: bodyNodeId("press", "rail"),
    });
    expect(rows.filter((row) => row.selected).map((row) => row.id)).toEqual([
      bodyNodeId("press", "rail"),
    ]);
    expect(rows.find((row) => row.renaming)?.label).toBe(railBody.name);
  });
});
