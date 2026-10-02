import type { Assembly } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { nodeSelection, selectedNodeIdOf } from "../selection.ts";
import {
  hingeJoint,
  pantinResponse,
  railBody,
  slideJoint,
  sourceOf,
  stepBody,
} from "../test-fixtures.ts";
import {
  assemblyNodeId,
  bodyIdOfNode,
  bodyNodeId,
  folderNodeId,
  jointNodeId,
  pantinNodeId,
  parseNodeId,
  sourceNodeNodeId,
} from "./node-ids.ts";
import { buildTree, findNode } from "./tree-model.ts";
import { flattenTree, type TreeViewState } from "./tree-rows.ts";
import { nodeExists, withRevealedNode, withTreeStateCarried } from "./tree-state.ts";

const translate = createTranslator("fr");
const source = { openPantin: pantinResponse(false) };

function view(expanded: string[], selected: string | null = null): TreeViewState {
  return {
    expandedNodeIds: new Set(expanded),
    selection: nodeSelection(selected),
    renamingNodeId: null,
  };
}

const BETWEEN = "Liaisons entre assemblages";
const openAndBodiesExpanded = [pantinNodeId("press"), assemblyNodeId("press", "main")];

describe("node ids", () => {
  it.each([
    pantinNodeId("press"),
    assemblyNodeId("press", "verin_pince"),
    bodyNodeId("press", "rail"),
    jointNodeId("press", "hinge"),
    jointNodeId("press", "hinge", "rail"),
    folderNodeId("press", "betweenAssemblies"),
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
    "folder:press:bodies",
    "assembly:press",
    "pantin:a:b",
    "joint:press:hinge:",
  ])("refuses %s", (nodeId) => {
    expect(parseNodeId(nodeId)).toBeNull();
  });

  it("finds the body of a body or source node only", () => {
    expect(bodyIdOfNode(sourceNodeNodeId("press", "rail", 0))).toBe("rail");
    expect(bodyIdOfNode(pantinNodeId("press"))).toBeNull();
  });
});

describe("buildTree", () => {
  const tree = buildTree(sourceOf(source), translate);

  it("has no root in the list view, when no Pantin is open", () => {
    expect(buildTree(sourceOf({ openPantin: null }), translate)).toEqual([]);
  });

  it("starts at the open Pantin, with its body count", () => {
    expect(tree.map((node) => [node.label, node.detail])).toEqual([["Press", "1 corps"]]);
  });

  it("puts the assemblies under the Pantin, then the joints between them (ADR 0019)", () => {
    expect(tree[0]?.children.map((node) => [node.label, node.detail])).toEqual([
      ["main", "main"],
      [BETWEEN, "0"],
    ]);
  });

  it("puts the bodies under their assembly with an icon per source format", () => {
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

const gripper: Assembly = {
  key: "gripper",
  name: "Gripper",
  placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
};

describe("joints in assemblies", () => {
  const carriage = stepBody("carriage", "Carriage");
  const withJoints = buildTree(
    sourceOf({
      openPantin: pantinResponse(false, [railBody, carriage], "press", [hingeJoint, slideJoint]),
    }),
    translate,
  );
  const tool = { ...stepBody("tool", "Tool"), assembly: "gripper" };
  const between = pantinResponse(false, [railBody, carriage, tool], "press", [
    { ...hingeJoint, parent: "carriage", child: "tool" },
  ]);

  it("lists the joints of one assembly under it, after its bodies", () => {
    const main = findNode(withJoints, assemblyNodeId("press", "main"));
    expect(main).toMatchObject({ kind: "assembly", icon: "assembly", renamable: true });
    expect(main?.children.map((node) => node.label)).toEqual([
      "Linear rail",
      "Carriage",
      "Hinge",
      "Slide",
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

  it("puts a joint whose bodies are in two assemblies in the folder", () => {
    const openPantin = {
      ...between,
      document: {
        ...between.document,
        assemblies: [...between.document.assemblies, gripper],
      },
    };
    const tree = buildTree(sourceOf({ openPantin }), translate);
    const folder = findNode(tree, folderNodeId("press", "betweenAssemblies"));
    expect([folder?.detail, folder?.children.map((node) => node.id)]).toEqual([
      "1",
      [jointNodeId("press", "hinge")],
    ]);
    const main = findNode(tree, assemblyNodeId("press", "main"));
    expect(main?.children.some((node) => node.kind === "joint")).toBe(false);
  });
});

describe("flattenTree", () => {
  const tree = buildTree(sourceOf(source), translate);

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
      [1, "main", pantinNodeId("press")],
      [2, "Linear rail", assemblyNodeId("press", "main")],
      [3, "3630.00.0800N_0", bodyNodeId("press", "rail")],
      [3, "(nœud sans nom)", bodyNodeId("press", "rail")],
      [1, BETWEEN, pantinNodeId("press")],
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

describe("joints under their bodies", () => {
  const openPantin = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
    hingeJoint,
  ]);
  const tree = buildTree(sourceOf({ openPantin }), translate);

  it("lists a joint under its parent and its child, before the CAD nodes", () => {
    const rail = findNode(tree, bodyNodeId("press", "rail"));
    expect(rail?.children[0]).toMatchObject({
      id: jointNodeId("press", "hinge", "rail"),
      kind: "joint",
      label: "Hinge",
      detail: "Pivot limité, parent",
    });
    expect(rail?.children.slice(1).every((node) => node.kind === "sourceNode")).toBe(true);
    const carriage = findNode(tree, bodyNodeId("press", "carriage"));
    expect(carriage?.children[0]?.detail).toBe("Pivot limité, enfant");
  });

  it("stands for the same joint as the folder entry", () => {
    expect(parseNodeId(jointNodeId("press", "hinge", "rail"))).toEqual({
      kind: "joint",
      pantinId: "press",
      jointId: "hinge",
      underBodyId: "rail",
    });
  });

  it("exists only while the joint still holds that body", () => {
    expect(nodeExists(sourceOf({ openPantin }), jointNodeId("press", "hinge", "carriage"))).toBe(
      true,
    );
    expect(nodeExists(sourceOf({ openPantin }), jointNodeId("press", "hinge", "ghost"))).toBe(
      false,
    );
  });

  it("unfolds the body to reveal it", () => {
    const revealed = withRevealedNode(
      sourceOf({ ...view([]), openPantin }),
      jointNodeId("press", "hinge", "rail"),
    );
    expect([...revealed.expandedNodeIds]).toEqual([
      pantinNodeId("press"),
      assemblyNodeId("press", "main"),
      bodyNodeId("press", "rail"),
    ]);
  });
});

describe("withTreeStateCarried", () => {
  it("restores the selection lost when the fresh Pantin dropped the old assembly node", () => {
    const from = assemblyNodeId("press", "id1s0400125e-0");
    const to = assemblyNodeId("press", "verin_pince");
    const before = view([pantinNodeId("press"), from], from);
    // What applying the fresh Pantin leaves: the old node gone, the Pantin selected.
    const fresh = view([pantinNodeId("press"), from], pantinNodeId("press"));
    const carried = withTreeStateCarried(before, fresh, from, to);
    expect([...carried.expandedNodeIds]).toEqual([pantinNodeId("press"), to]);
    expect(selectedNodeIdOf(carried.selection)).toBe(to);
  });
});

describe("hidden assemblies in the tree", () => {
  it("gives assemblies an eye, closed when the 3D view hides them, and nothing else", () => {
    const assemblyDisplay = { hiddenAssemblyKeys: new Set(["main"]), isolatedAssemblyKey: null };
    const tree = buildTree(sourceOf({ ...source, assemblyDisplay }), translate);
    const main = findNode(tree, assemblyNodeId("press", "main"));
    expect([main?.detail, main?.visibility, main?.stateLabel]).toEqual([
      "main",
      "hidden",
      "masqué",
    ]);
    expect(
      findNode(buildTree(sourceOf(source), translate), assemblyNodeId("press", "main"))?.visibility,
    ).toBe("shown");
    expect(findNode(tree, bodyNodeId("press", "rail"))?.visibility).toBeNull();
  });
});
