import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, pantinSummaries, railBody } from "../test-fixtures.ts";
import {
  bodyIdOfNode,
  bodyNodeId,
  folderNodeId,
  pantinNodeId,
  parseNodeId,
  sourceNodeNodeId,
} from "./node-ids.ts";
import { buildTree, findNode, flattenTree, type TreeViewState } from "./tree-model.ts";

const translate = createTranslator("fr");
const source = { pantins: pantinSummaries, openPantin: pantinResponse(false) };

function view(expanded: string[], selected: string | null = null): TreeViewState {
  return { expandedNodeIds: new Set(expanded), selectedNodeId: selected, renamingNodeId: null };
}

const openAndBodiesExpanded = [pantinNodeId("press"), folderNodeId("press", "bodies")];

describe("node ids", () => {
  it.each([
    pantinNodeId("press"),
    folderNodeId("press", "bodies"),
    bodyNodeId("press", "rail"),
    sourceNodeNodeId("press", "rail", 1),
  ])("round trips %s", (nodeId) => {
    expect(parseNodeId(nodeId)).not.toBeNull();
  });

  it.each([
    "",
    "pantin:",
    "body:press",
    "source:press:rail:x",
    "folder:press:joints",
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

  it("lists every Pantin as a root with its body count", () => {
    expect(tree.map((node) => [node.label, node.detail])).toEqual([
      ["Press", "1 corps"],
      ["Robot", "4 corps"],
    ]);
  });

  it("loads children only for the open Pantin", () => {
    expect(tree[0]?.children?.map((node) => node.label)).toEqual(["Corps"]);
    expect(tree[1]?.children).toBeNull();
  });

  it("puts the bodies in the Corps folder with an icon per source format", () => {
    const body = findNode(tree, bodyNodeId("press", "rail"));
    expect(body).toMatchObject({ label: "Linear rail", icon: "body-glb", renamable: true });
  });

  it("keeps the verbatim source node names as greyed, read-only children", () => {
    const body = findNode(tree, bodyNodeId("press", "rail"));
    expect(
      body?.children?.map((node) => [node.label, node.detail, node.muted, node.renamable]),
    ).toEqual([
      ["3630.00.0800N_0", "0/0", true, false],
      ["(nœud sans nom)", "0/1", true, false],
    ]);
  });

  it("shows a freshly created Pantin before the list is refreshed", () => {
    const created = { ...pantinResponse(false, [], "new-one") };
    const roots = buildTree({ pantins: pantinSummaries, openPantin: created }, translate);
    expect(roots.map((node) => node.id)).toContain(pantinNodeId("new-one"));
  });
});

describe("flattenTree", () => {
  const tree = buildTree(source, translate);

  it("shows only roots when nothing is expanded; every Pantin is expandable", () => {
    const rows = flattenTree(tree, view([]));
    expect(rows.map((row) => [row.id, row.expandable, row.expanded])).toEqual([
      [pantinNodeId("press"), true, false],
      [pantinNodeId("robot"), true, false],
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
      [0, "Robot", null],
    ]);
    expect(rows[4]).toMatchObject({ positionInSet: 2, setSize: 2, expandable: false });
  });

  it("never expands a closed Pantin, even if asked, since its children are not loaded", () => {
    const rows = flattenTree(tree, view([pantinNodeId("robot")]));
    expect(rows.find((row) => row.id === pantinNodeId("robot"))?.expanded).toBe(false);
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
