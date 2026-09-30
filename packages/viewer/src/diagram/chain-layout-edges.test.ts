import { describe, expect, it } from "vitest";
import { layoutChainDiagram } from "./chain-layout.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, jointOf } from "./diagram-fixtures.ts";
import { edgePairs, pathsMeet, pathsShareSegment } from "./diagram-geometry.ts";
import type { ChainDiagram } from "./diagram-types.ts";

// How the wires of a feed are drawn (ADR 0029 point 5): the picture must tell
// the default wiring of a valve from the swapped one.

function valveAndCylinder(ports: Record<string, string>): ChainDiagram {
  const document = documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("rod", "a")],
    joints: [jointOf("stroke", "rod")],
    drives: [driveOf("valve", "a")],
    actuators: [cylinderOf("cyl", "a", "valve", ["stroke"], ports)],
  });
  return layoutChainDiagram(document, new Set());
}

function feedEdges(diagram: ChainDiagram) {
  return diagram.edges.filter((edge) => edge.kind === "pneumatic");
}

describe("layoutChainDiagram feed edges", () => {
  it("draws the default feed of a 5/2 valve on a double-acting cylinder without crossing", () => {
    const diagram = valveAndCylinder({ cap: "port_4", rod: "port_2" });
    const [first, second] = feedEdges(diagram);
    expect(feedEdges(diagram)).toHaveLength(2);
    expect(first && second && pathsMeet(first, second)).toBe(false);
    // Straight across: each wire is a single horizontal segment.
    expect(feedEdges(diagram).map((edge) => edge.points.length)).toEqual([2, 2]);
  });

  it("orders the input sockets by the drive ports the type reads by default", () => {
    const cylinder = valveAndCylinder({ cap: "port_4", rod: "port_2" }).nodes.find(
      (node) => node.id === "actuator:cyl",
    );
    expect(cylinder?.sockets.filter((s) => s.role === "input").map((s) => s.label)).toEqual([
      "rod",
      "cap",
    ]);
  });

  it("makes a swapped feed cross, so it does not look like the default", () => {
    const swapped = valveAndCylinder({ cap: "port_2", rod: "port_4" });
    const [first, second] = feedEdges(swapped);
    expect(feedEdges(swapped).map((edge) => edge.label)).toEqual(["port_4 → rod", "port_2 → cap"]);
    expect(first && second && pathsMeet(first, second)).toBe(true);
  });

  it("keeps the input sockets in declaration order when the actuator has no feed", () => {
    const document = documentOf({
      assemblies: ["a"],
      bodies: [],
      actuators: [cylinderOf("cyl", "a", null, [])],
    });
    const node = layoutChainDiagram(document, new Set()).nodes[0];
    expect(node?.sockets.filter((s) => s.role === "input").map((s) => s.label)).toEqual([
      "cap",
      "rod",
    ]);
  });

  it("gives labelled edges an anchor at their target and unlabelled ones none", () => {
    const diagram = valveAndCylinder({ cap: "port_4", rod: "port_2" });
    for (const edge of diagram.edges) {
      expect(edge.labelAnchor !== undefined).toBe(edge.label !== undefined);
      if (edge.labelAnchor !== undefined) {
        expect(edge.labelAnchor).toEqual(edge.points.at(-1));
      }
    }
  });
});

describe("layoutChainDiagram wires of one node", () => {
  // Two cylinders wired in opposite ways on one valve: wires go up and down.
  const fanOut = documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("r1", "a"), bodyOf("r2", "a")],
    joints: [jointOf("j1", "r1"), jointOf("j2", "r2")],
    drives: [driveOf("valve", "a")],
    actuators: [
      cylinderOf("c1", "a", "valve", ["j1"], { cap: "port_2", rod: "port_4" }),
      cylinderOf("c2", "a", "valve", ["j2"], { cap: "port_4", rod: "port_2" }),
    ],
  });

  it("never run along one another, from different sockets", () => {
    const diagram = layoutChainDiagram(fanOut, new Set());
    const shared = edgePairs(
      diagram,
      (a, b) => a.fromSocket !== b.fromSocket && pathsShareSegment(a, b),
    );
    expect(shared).toEqual([]);
  });

  it("leave and enter horizontally, and stay inside the gap before the target", () => {
    const diagram = layoutChainDiagram(fanOut, new Set());
    for (const edge of feedEdges(diagram)) {
      const [start, end] = [edge.points[0], edge.points.at(-1)];
      expect(edge.points[1]?.y).toBe(start?.y);
      expect(edge.points.at(-2)?.y).toBe(end?.y);
      for (const point of edge.points) {
        expect(point.x).toBeGreaterThanOrEqual(start?.x ?? 0);
        expect(point.x).toBeLessThanOrEqual(end?.x ?? 0);
      }
    }
  });
});
