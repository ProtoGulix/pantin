import { bodyEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { type StarFixture, scieFixture, starDocument } from "./joint-star-fixtures.ts";
import { buildJointStarForest } from "./joint-star-forest.ts";
import {
  curvePath,
  LABEL_ELLIPSIS,
  LABEL_MAX_CHARACTERS,
  layoutJointStar,
  type PlacedNode,
  ROW_PITCH,
  type StarLayout,
  shortenLabel,
} from "./joint-star-layout.ts";
import { IDENTITY_VIEWPORT, projectEdge } from "./joint-star-viewport.ts";

function layoutOf(fixture: StarFixture, unfoldedIds: string[] = []): StarLayout {
  return layoutJointStar(buildJointStarForest(starDocument(fixture), new Set(unfoldedIds)));
}

function unfoldedScie(): StarLayout {
  const fixture = scieFixture();
  return layoutOf(
    fixture,
    fixture.assemblies.map((key) => `assembly:${key}`),
  );
}

function columnsOf(layout: StarLayout): Map<number, PlacedNode[]> {
  const columns = new Map<number, PlacedNode[]>();
  for (const node of layout.nodes) {
    columns.set(node.depth, [...(columns.get(node.depth) ?? []), node]);
  }
  return columns;
}

function nodeOf(layout: StarLayout, id: string): PlacedNode {
  const node = layout.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) {
    throw new Error(`no node ${id}`);
  }
  return node;
}

// World, then a base body with three jointed children and one jointed grandchild.
const machine: StarFixture = {
  assemblies: ["base"],
  bodies: [
    ["hub", "base"],
    ["x", "base"],
    ["y", "base"],
    ["z", "base"],
    ["w", "base"],
  ],
  joints: [
    { id: "jx", parent: bodyEndpoint("hub"), child: bodyEndpoint("x") },
    { id: "jy", parent: bodyEndpoint("hub"), child: bodyEndpoint("y") },
    { id: "jz", parent: bodyEndpoint("hub"), child: bodyEndpoint("z") },
    { id: "jw", parent: bodyEndpoint("y"), child: bodyEndpoint("w") },
  ],
};

describe("layoutJointStar", () => {
  it("puts World alone at the left for an empty Pantin", () => {
    const layout = layoutOf({ assemblies: ["a"], bodies: [] });
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]).toMatchObject({ kind: "world", y: 0, depth: 0 });
    expect(layout.edges).toEqual([]);
  });

  it("puts World leftmost and every depth in its own column, going right", () => {
    const layout = layoutOf(machine);
    const world = nodeOf(layout, "world");
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(world.x);
    }
    const xOfDepth = [...columnsOf(layout).entries()].map(([, nodes]) => nodes[0]?.x ?? 0);
    expect(xOfDepth).toEqual([...xOfDepth].sort((a, b) => a - b));
    expect(new Set(xOfDepth).size).toBe(xOfDepth.length);
    for (const nodes of columnsOf(layout).values()) {
      expect(new Set(nodes.map((node) => node.x)).size).toBe(1);
    }
  });

  it("stacks children top to bottom in forest order and centres the parent on them", () => {
    const layout = layoutOf(machine);
    const x = nodeOf(layout, "body:x");
    const y = nodeOf(layout, "body:y");
    const z = nodeOf(layout, "body:z");
    expect(x.y).toBeLessThan(y.y);
    expect(y.y).toBeLessThan(z.y);
    // hub: first and last child; world and hub only have one child each.
    const hub = nodeOf(layout, "body:hub");
    expect(hub.y).toBeCloseTo((x.y + z.y) / 2);
    expect(nodeOf(layout, "world").y).toBeCloseTo(hub.y);
    expect(nodeOf(layout, "body:w").depth).toBe(nodeOf(layout, "body:y").depth + 1);
  });
});

describe("layoutJointStar, row pitch and parents", () => {
  it("keeps two nodes of a column at least one row pitch apart, subtrees never overlap", () => {
    for (const layout of [unfoldedScie(), layoutOf(machine)]) {
      for (const nodes of columnsOf(layout).values()) {
        for (const [index, node] of nodes.entries()) {
          for (const other of nodes.slice(index + 1)) {
            expect(Math.abs(node.y - other.y)).toBeGreaterThanOrEqual(ROW_PITCH - 1e-6);
          }
        }
      }
    }
  });

  it("centres every parent on its first and last child", () => {
    const layout = unfoldedScie();
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    const childrenOf = new Map<string, PlacedNode[]>();
    for (const edge of layout.edges) {
      const child = byId.get(edge.childId);
      if (child !== undefined) {
        childrenOf.set(edge.parentId, [...(childrenOf.get(edge.parentId) ?? []), child]);
      }
    }
    expect(childrenOf.size).toBeGreaterThan(5);
    for (const [parentId, children] of childrenOf) {
      const first = children[0]?.y ?? 0;
      const last = children[children.length - 1]?.y ?? 0;
      expect(byId.get(parentId)?.y).toBeCloseTo((first + last) / 2);
    }
  });
});

describe("layoutJointStar, real shapes", () => {
  it("lays the Translateur SCIE shape as a chain of ten groups, 62 nodes unfolded", () => {
    const folded = layoutOf(scieFixture());
    expect(folded.nodes).toHaveLength(11);
    expect(Math.max(...folded.nodes.map((node) => node.depth))).toBe(10);
    const unfolded = unfoldedScie();
    expect(unfolded.nodes).toHaveLength(62);
    expect(unfolded.bounds.maxY).toBeGreaterThan(folded.bounds.maxY);
  });

  it("lays a hub of 20 fixed joints as 20 rows under one node", () => {
    const hubBodies = Array.from({ length: 20 }, (_, index) => `s${index}`);
    const layout = layoutOf({
      assemblies: ["a"],
      bodies: [["hub", "a"], ...hubBodies.map((id): [string, string] => [id, "a"])],
      joints: hubBodies.map((id) => ({
        id: `j${id}`,
        parent: bodyEndpoint("hub"),
        child: bodyEndpoint(id),
      })),
    });
    const spokes = layout.nodes.filter((node) => node.depth === 2);
    expect(spokes).toHaveLength(20);
    const ys = spokes.map((node) => node.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(ys[19]).toBeCloseTo(19 * ROW_PITCH);
    expect(nodeOf(layout, "body:hub").y).toBeCloseTo((19 * ROW_PITCH) / 2);
  });
});

describe("layoutJointStar, folding", () => {
  it("shows unfolded following bodies as leaves under their group, with a toggle", () => {
    const fixture: StarFixture = {
      assemblies: ["g", "h"],
      bodies: [
        ["one", "g"],
        ["two", "g"],
        ["other", "h"],
      ],
      joints: [
        { id: "j", parent: { kind: "assembly", key: "g" }, child: { kind: "assembly", key: "h" } },
      ],
    };
    const folded = layoutOf(fixture);
    expect(nodeOf(folded, "assembly:g")).toMatchObject({ hasToggle: true, unfolded: false });
    expect(folded.nodes.some((node) => node.isFollowingLeaf)).toBe(false);
    const unfolded = layoutOf(fixture, ["assembly:g"]);
    const leaves = unfolded.nodes.filter((node) => node.isFollowingLeaf);
    expect(leaves.map((node) => node.id)).toEqual(["body:one", "body:two"]);
    expect(nodeOf(unfolded, "assembly:g")).toMatchObject({ hasToggle: true, unfolded: true });
    expect(nodeOf(unfolded, "body:one").depth).toBe(nodeOf(unfolded, "assembly:g").depth + 1);
    expect(nodeOf(unfolded, "body:one").x).toBeGreaterThan(
      nodeOf(unfolded, "assembly:g").x + nodeOf(unfolded, "assembly:g").width,
    );
  });
});

describe("layoutJointStar, edges and bounds", () => {
  it("starts every edge at the right edge of its own parent and ends it at the child's left edge", () => {
    const longName = "a-very-long-name-indeed";
    const layout = layoutOf({
      assemblies: ["a"],
      bodies: [
        ["hub", "a"],
        ["short", "a"],
        [longName, "a"],
      ],
      joints: ["short", longName].map((id) => ({
        id: `j-${id}`,
        parent: bodyEndpoint("hub"),
        child: bodyEndpoint(id),
      })),
    });
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of layout.edges) {
      const parent = byId.get(edge.parentId);
      const child = byId.get(edge.childId);
      if (parent === undefined || child === undefined) {
        throw new Error("edge without nodes");
      }
      const ends = projectEdge(IDENTITY_VIEWPORT, parent, child);
      expect(ends.from).toEqual({ x: parent.x + parent.width, y: parent.y });
      expect(ends.to).toEqual({ x: child.x, y: child.y });
      expect(ends.to.x).toBeGreaterThan(ends.from.x);
    }
  });
});

describe("layoutJointStar, shapes and marks", () => {
  it("sizes each shape to its own name, and the selected one to the whole name", () => {
    const longName = "a-very-long-name-indeed";
    const layout = layoutOf({
      assemblies: ["a"],
      bodies: [
        ["hub", "a"],
        ["short", "a"],
        [longName, "a"],
        ["leaf", "a"],
      ],
      joints: [
        { id: "j1", parent: bodyEndpoint("hub"), child: bodyEndpoint("short") },
        { id: "j2", parent: bodyEndpoint("hub"), child: bodyEndpoint(longName) },
        { id: "j3", parent: bodyEndpoint("short"), child: bodyEndpoint("leaf") },
      ],
    });
    const short = nodeOf(layout, "body:short");
    const long = nodeOf(layout, `body:${longName}`);
    expect(short.x).toBe(long.x);
    expect(short.width).toBeLessThan(long.width);
    expect(short.fullWidth).toBeGreaterThanOrEqual(short.width);
    expect(long.fullWidth).toBeGreaterThan(long.width);
    const leaf = nodeOf(layout, "body:leaf");
    expect(leaf.x).toBeGreaterThan(long.x + long.width);
  });
});

describe("layoutJointStar, marks", () => {
  it("puts the marks of a joint on its curve, near the child, on the side away from the curve", () => {
    const layout = layoutOf(machine, ["assembly:base"]);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of layout.edges) {
      const parent = byId.get(edge.parentId);
      const child = byId.get(edge.childId);
      if (parent === undefined || child === undefined) {
        throw new Error("edge without nodes");
      }
      const ends = projectEdge(IDENTITY_VIEWPORT, parent, child);
      expect(ends.marksAt.x).toBeGreaterThan((ends.from.x + ends.to.x) / 2);
      expect(ends.marksSide).toBe(parent.y > child.y ? -1 : 1);
    }
  });

  it("draws a curve with horizontal tangents between two ends", () => {
    expect(curvePath({ x: 0, y: 0 }, { x: 100, y: 40 })).toBe("M 0 0 C 50 0, 50 40, 100 40");
  });

  it("contains every node and its label in the bounds", () => {
    const layout = unfoldedScie();
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(layout.bounds.minX);
      expect(node.x + node.width).toBeLessThanOrEqual(layout.bounds.maxX);
      expect(node.y).toBeGreaterThan(layout.bounds.minY);
      expect(node.y).toBeLessThan(layout.bounds.maxY);
    }
  });

  it("is deterministic", () => {
    expect(unfoldedScie()).toEqual(unfoldedScie());
  });
});

describe("shortenLabel", () => {
  it("keeps a short name and cuts a long one with an ellipsis", () => {
    expect(shortenLabel("short")).toBe("short");
    const long = "x".repeat(LABEL_MAX_CHARACTERS + 5);
    const shortened = shortenLabel(long);
    expect([...shortened]).toHaveLength(LABEL_MAX_CHARACTERS);
    expect(shortened.endsWith(LABEL_ELLIPSIS)).toBe(true);
  });

  it("counts code points, not UTF-16 units", () => {
    const emojis = "😀".repeat(LABEL_MAX_CHARACTERS);
    expect(shortenLabel(emojis)).toBe(emojis);
  });
});
