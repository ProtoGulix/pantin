import { describe, expect, it } from "vitest";
import { assemblyNodeId, bodyNodeId, jointNodeId } from "../tree/node-ids.ts";
import { layoutChainDiagram } from "./chain-layout.ts";
import { createChainLinksCache } from "./diagram-chains.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, encoderOf, jointOf } from "./diagram-fixtures.ts";
import {
  diagramHighlight,
  highlightedBodyIds,
  relatedEdgeIds,
  treeNodeForJointNode,
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

const none = { selectedNodeId: null, selectedDevice: null };
const device = (kind: "drive" | "actuator" | "sensor", id: string) => ({
  selectedNodeId: null,
  selectedDevice: { kind, id } as const,
});

describe("treeNodeForJointNode", () => {
  it("names the tree row of a joint node, under its child body", () => {
    expect(treeNodeForJointNode(links, "p", "joint:j2")).toBe(jointNodeId("p", "j2", "s2"));
  });

  it("answers null for a node that is no joint", () => {
    expect(treeNodeForJointNode(links, "p", "drive:v1")).toBeNull();
    expect(treeNodeForJointNode(links, "p", "sensor:e1")).toBeNull();
  });
});

describe("highlight and bodies of a selected device", () => {
  it("a drive is selected, its chain related, and its bodies highlighted in 3D", () => {
    const selections = device("drive", "v1");
    const highlight = diagramHighlight(document, links, selections);
    expect(highlight.get("drive:v1")).toBe("selected");
    expect(highlight.get("actuator:c1")).toBe("related");
    expect(highlight.get("joint:j2")).toBe("related");
    expect(highlightedBodyIds(document, links, selections)).toEqual(new Set(["s1", "s2"]));
  });

  it("an actuator moves the bodies of its joints", () => {
    const selections = device("actuator", "c2");
    expect(diagramHighlight(document, links, selections).get("actuator:c2")).toBe("selected");
    expect(highlightedBodyIds(document, links, selections)).toEqual(new Set(["s2"]));
  });

  it("a sensor shows the body of the joint it watches", () => {
    const selections = device("sensor", "e1");
    expect(diagramHighlight(document, links, selections).get("sensor:e1")).toBe("selected");
    expect(highlightedBodyIds(document, links, selections)).toEqual(new Set(["s2"]));
  });

  it("a drive that feeds nothing highlights no body", () => {
    const selections = device("drive", "v2");
    expect(diagramHighlight(document, links, selections).get("drive:v2")).toBe("selected");
    expect(highlightedBodyIds(document, links, selections).size).toBe(0);
  });

  it("a device the diagram does not draw highlights nothing", () => {
    const selections = device("drive", "ghost");
    expect(diagramHighlight(document, links, selections).size).toBe(0);
    expect(highlightedBodyIds(document, links, selections).size).toBe(0);
  });
});

describe("highlight and bodies of a tree selection", () => {
  it("a joint selected in the tree is the selected node", () => {
    const highlight = diagramHighlight(document, links, {
      ...none,
      selectedNodeId: jointNodeId("p", "j1", "s1"),
    });
    expect(highlight.get("joint:j1")).toBe("selected");
    expect(highlight.get("actuator:c1")).toBe("related");
    expect(highlight.has("joint:j2")).toBe(false);
  });

  it("a body or an assembly selected in 3D highlights the chains that move it", () => {
    const body = diagramHighlight(document, links, {
      ...none,
      selectedNodeId: bodyNodeId("p", "s1"),
    });
    expect([...body.keys()].sort()).toEqual(["actuator:c1", "drive:v1", "joint:j1"]);
    const assembly = diagramHighlight(document, links, {
      ...none,
      selectedNodeId: assemblyNodeId("p", "a"),
    });
    expect(assembly.size).toBe(6);
    expect([...assembly.values()].every((kind) => kind === "related")).toBe(true);
    expect(
      highlightedBodyIds(document, links, { ...none, selectedNodeId: bodyNodeId("p", "s1") }),
    ).toEqual(new Set(["s1"]));
  });

  it("highlights nothing without a selection", () => {
    expect(diagramHighlight(document, links, none).size).toBe(0);
    expect(highlightedBodyIds(document, links, none).size).toBe(0);
  });

  it("a joint tints its child body", () => {
    const selections = { ...none, selectedNodeId: jointNodeId("p", "j2", "s2") };
    expect(highlightedBodyIds(document, links, selections)).toEqual(new Set(["s2"]));
  });
});

describe("relatedEdgeIds", () => {
  it("keeps the wires whose two ends are highlighted", () => {
    const diagram = layoutChainDiagram(document, new Set(), "en");
    const highlight = diagramHighlight(document, links, {
      ...none,
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
