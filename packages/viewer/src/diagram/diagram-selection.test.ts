import { describe, expect, it } from "vitest";
import { assemblyNodeId, bodyNodeId, jointNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { layoutChainDiagram } from "./chain-layout.ts";
import { createChainLinksCache } from "./diagram-chains.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, encoderOf, jointOf } from "./diagram-fixtures.ts";
import {
  diagramHighlight,
  highlightedBodyIds,
  relatedEdgeIds,
  treeNodeForDiagramNode,
} from "./diagram-selection.ts";

const document = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a"), bodyOf("s2", "a")],
  joints: [jointOf("j1", "s1"), jointOf("j2", "s2")],
  drives: [driveOf("v1", "a"), driveOf("v2", "a")],
  actuators: [cylinderOf("c1", "a", "v1", ["j1"]), cylinderOf("c2", "a", "v1", ["j2"])],
  sensors: [encoderOf("e1", "a", "j2")],
});
const links = createChainLinksCache()(document);

describe("treeNodeForDiagramNode", () => {
  it("selects the joint itself, the first joint downstream, or the watched joint", () => {
    expect(treeNodeForDiagramNode(links, "p", "joint:j2")).toBe(jointNodeId("p", "j2", "s2"));
    expect(treeNodeForDiagramNode(links, "p", "drive:v1")).toBe(jointNodeId("p", "j1", "s1"));
    expect(treeNodeForDiagramNode(links, "p", "actuator:c2")).toBe(jointNodeId("p", "j2", "s2"));
    expect(treeNodeForDiagramNode(links, "p", "sensor:e1")).toBe(jointNodeId("p", "j2", "s2"));
  });

  it("falls back to the Pantin for a drive that feeds nothing", () => {
    expect(treeNodeForDiagramNode(links, "p", "drive:v2")).toBe(pantinNodeId("p"));
  });
});

describe("highlight and bodies of a clicked node", () => {
  const clicked = (diagramNodeId: string) => ({
    diagramNodeId,
    selectedNodeId: treeNodeForDiagramNode(links, "p", diagramNodeId),
  });

  it("a clicked drive is selected, its chain related, and its bodies highlighted in 3D", () => {
    const selections = clicked("drive:v1");
    const highlight = diagramHighlight(document, links, "p", selections);
    expect(highlight.get("drive:v1")).toBe("selected");
    expect(highlight.get("joint:j2")).toBe("related");
    expect(highlightedBodyIds(document, links, "p", selections)).toEqual(new Set(["s1", "s2"]));
  });

  it("forgets the clicked node once the tree selects something else", () => {
    const selections = { diagramNodeId: "drive:v1", selectedNodeId: bodyNodeId("p", "s1") };
    expect(diagramHighlight(document, links, "p", selections).has("drive:v1")).toBe(true);
    expect(diagramHighlight(document, links, "p", selections).get("drive:v1")).toBe("related");
    expect(highlightedBodyIds(document, links, "p", selections)).toEqual(new Set(["s1"]));
  });

  it("a joint selected in the tree is the selected node", () => {
    const highlight = diagramHighlight(document, links, "p", {
      diagramNodeId: null,
      selectedNodeId: jointNodeId("p", "j1", "s1"),
    });
    expect(highlight.get("joint:j1")).toBe("selected");
    expect(highlight.get("actuator:c1")).toBe("related");
    expect(highlight.has("joint:j2")).toBe(false);
  });

  it("a body or an assembly selected in 3D highlights the chains that move it", () => {
    const body = diagramHighlight(document, links, "p", {
      diagramNodeId: null,
      selectedNodeId: bodyNodeId("p", "s1"),
    });
    expect([...body.keys()].sort()).toEqual(["actuator:c1", "drive:v1", "joint:j1"]);
    const assembly = diagramHighlight(document, links, "p", {
      diagramNodeId: null,
      selectedNodeId: assemblyNodeId("p", "a"),
    });
    expect(assembly.size).toBe(6);
    expect([...assembly.values()].every((kind) => kind === "related")).toBe(true);
  });

  it("highlights nothing without a selection", () => {
    const none = { diagramNodeId: null, selectedNodeId: null };
    expect(diagramHighlight(document, links, "p", none).size).toBe(0);
    expect(highlightedBodyIds(document, links, "p", none).size).toBe(0);
  });
});

describe("relatedEdgeIds", () => {
  it("keeps the wires whose two ends are highlighted", () => {
    const diagram = layoutChainDiagram(document, new Set());
    const highlight = diagramHighlight(document, links, "p", {
      diagramNodeId: null,
      selectedNodeId: jointNodeId("p", "j1", "s1"),
    });
    const related = relatedEdgeIds(diagram, highlight);
    expect(related.size).toBeGreaterThan(0);
    for (const edge of diagram.edges.filter((candidate) => related.has(candidate.id))) {
      expect([edge.fromNode, edge.toNode].every((id) => highlight.has(id))).toBe(true);
    }
    expect(diagram.edges.some((edge) => !related.has(edge.id))).toBe(true);
    expect(relatedEdgeIds(null, highlight).size).toBe(0);
  });
});

describe("a joint selected in the tree", () => {
  it("tints its child body like the same joint clicked in the diagram", () => {
    const fromTree = highlightedBodyIds(document, links, "p", {
      diagramNodeId: null,
      selectedNodeId: jointNodeId("p", "j2", "s2"),
    });
    const fromDiagram = highlightedBodyIds(document, links, "p", {
      diagramNodeId: "joint:j2",
      selectedNodeId: treeNodeForDiagramNode(links, "p", "joint:j2"),
    });
    expect(fromTree).toEqual(new Set(["s2"]));
    expect(fromDiagram).toEqual(fromTree);
  });
});
