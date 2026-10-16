import type { Assembly, PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { withAssemblyIsolationToggled } from "../assembly-display.ts";
import { createTranslator } from "../i18n/translate.ts";
import { titledNodeGroups } from "../properties/properties-test-helpers.ts";
import { nodeSelection } from "../selection.ts";
import { pantinResponse, sourceOf, stepBody } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId } from "./node-ids.ts";
import { buildTree, findNode } from "./tree-model.ts";
import { flattenTree } from "./tree-rows.ts";
import { withRevealedNode } from "./tree-state.ts";

const translate = createTranslator("fr");
const placement = {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
} satisfies Assembly["placement"];

// machine > carriage > bearing > ring (4 levels), and a body at each end.
function nestedPantin(): PantinResponse {
  const base = pantinResponse(false, [
    { ...stepBody("frame", "Frame"), assembly: "machine" },
    { ...stepBody("ball", "Ball"), assembly: "ring" },
  ]);
  const chain = ["machine", "carriage", "bearing", "ring"];
  return {
    ...base,
    document: {
      ...base.document,
      assemblies: chain.map((key, index) => ({
        key,
        name: `Name ${key}`,
        placement,
        ...(index === 0 ? {} : { parent: chain[index - 1] }),
      })),
    },
  };
}

describe("nested assemblies in the tree", () => {
  it("nests four levels, sub-assemblies before bodies", () => {
    const tree = buildTree(sourceOf({ openPantin: nestedPantin() }), translate);
    const machine = findNode(tree, assemblyNodeId("press", "machine"));
    expect(machine?.children.map((child) => child.kind)).toEqual(["assembly", "body"]);
    const ring = findNode(tree, assemblyNodeId("press", "ring"));
    expect(ring?.children.map((child) => child.id)).toEqual([bodyNodeId("press", "ball")]);
    const pantinChildren = tree[0]?.children.map((child) => child.kind);
    expect(pantinChildren).toEqual(["assembly", "folder"]);
  });

  it("renders every level when expanded, and reveals a deep body", () => {
    const openPantin = nestedPantin();
    const state = {
      expandedNodeIds: new Set<string>(),
      selection: null,
      renamingNodeId: null,
      openPantin,
    };
    const revealed = withRevealedNode(
      { ...state, language: "fr" as const },
      bodyNodeId("press", "ball"),
    );
    const tree = buildTree(sourceOf({ openPantin }), translate);
    const rows = flattenTree(tree, {
      expandedNodeIds: revealed.expandedNodeIds,
      selection: nodeSelection(bodyNodeId("press", "ball")),
      renamingNodeId: null,
    });
    const ball = rows.find((row) => row.id === bodyNodeId("press", "ball"));
    expect(ball?.depth).toBe(5);
    expect(rows.map((row) => row.id)).toContain(assemblyNodeId("press", "bearing"));
  });

  it("hides the whole subtree in the eyes of the tree during an isolation", () => {
    const openPantin = nestedPantin();
    const display = withAssemblyIsolationToggled(
      { hiddenAssemblyKeys: new Set(), isolatedAssemblyKey: null },
      "carriage",
    );
    const tree = buildTree(sourceOf({ openPantin, assemblyDisplay: display }), translate);
    const visibility = (key: string) => findNode(tree, assemblyNodeId("press", key))?.visibility;
    expect([visibility("machine"), visibility("carriage"), visibility("ring")]).toEqual([
      "hidden",
      "shown",
      "shown",
    ]);
  });
});

describe("a flat Pantin", () => {
  it("still renders with no parent at all", () => {
    const tree = buildTree(sourceOf({ openPantin: pantinResponse(false) }), translate);
    expect(tree[0]?.children.map((child) => child.kind)).toEqual(["assembly", "folder"]);
  });
});

describe("the containing assembly in the inspector rows", () => {
  const rowsOf = (key: string) =>
    titledNodeGroups(
      sourceOf({ openPantin: nestedPantin() }),
      assemblyNodeId("press", key),
      translate,
    )
      .flatMap((group) => group.rows)
      .map((row) => [row.label, row.value]);

  it("shows the container of a sub-assembly, read only", () => {
    expect(rowsOf("carriage")).toContainEqual(["Contenu dans", "Name machine"]);
  });

  it("shows nothing at top level", () => {
    expect(rowsOf("machine").map(([label]) => label)).not.toContain("Contenu dans");
  });
});
