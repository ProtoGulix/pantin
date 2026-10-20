import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { scieFixture, starDocument } from "./joint-star-fixtures.ts";
import { buildJointStarForest, type StarNode, WORLD_NODE_ID } from "./joint-star-forest.ts";

function allNodes(node: StarNode): StarNode[] {
  return [node, ...node.edges.flatMap((edge) => allNodes(edge.child))];
}

function nodeById(root: StarNode, id: string): StarNode {
  const found = allNodes(root).find((node) => node.id === id);
  if (found === undefined) {
    throw new Error(`no node ${id}`);
  }
  return found;
}

function summary(node: StarNode): string[] {
  return node.edges.map((edge) => `${edge.kind}:${edge.child.id}`);
}

describe("buildJointStarForest", () => {
  it("has only World for an empty Pantin", () => {
    const world = buildJointStarForest(starDocument({ assemblies: ["a"], bodies: [] }));
    expect(world.id).toBe(WORLD_NODE_ID);
    expect(world.kind).toBe("world");
    expect(world.edges).toEqual([]);
    expect(world.followingBodyCount).toBe(0);
  });

  it("hangs a single root from World and counts bodies that follow no group", () => {
    const world = buildJointStarForest(
      starDocument({
        assemblies: ["a"],
        bodies: [
          ["frame", "a"],
          ["slide", "a"],
          ["loose", "a"],
        ],
        joints: [
          {
            id: "j1",
            parent: bodyEndpoint("frame"),
            child: bodyEndpoint("slide"),
            type: "prismatic",
          },
        ],
        drivenJoints: ["j1"],
      }),
    );
    expect(summary(world)).toEqual(["anchor:body:frame"]);
    expect(world.followingBodyCount).toBe(1);
    const frame = nodeById(world, "body:frame");
    expect(summary(frame)).toEqual(["joint:body:slide"]);
    const edge = frame.edges[0];
    expect(edge?.jointType).toBe("prismatic");
    expect(edge?.driven).toBe(true);
    expect(edge?.watched).toBe(false);
  });

  it("marks a joint a sensor watches, whether or not an actuator moves it", () => {
    const document = starDocument({
      assemblies: ["a"],
      bodies: [
        ["frame", "a"],
        ["slide", "a"],
      ],
      joints: [
        {
          id: "j1",
          parent: bodyEndpoint("frame"),
          child: bodyEndpoint("slide"),
          type: "prismatic",
        },
      ],
      watchedJoints: ["j1"],
    });
    const edge = nodeById(buildJointStarForest(document), "body:frame").edges[0];
    expect(edge).toMatchObject({ driven: false, watched: true });
  });
});

describe("buildJointStarForest, roots", () => {
  it("gives nodes to a joint whose endpoints are unknown to the document", () => {
    // The schema refuses such a document, so the bodies are removed after parsing.
    const valid = starDocument({
      assemblies: ["a"],
      bodies: [
        ["parent", "a"],
        ["child", "a"],
      ],
      joints: [
        {
          id: "j1",
          parent: bodyEndpoint("parent"),
          child: bodyEndpoint("child"),
          type: "revolute",
        },
      ],
    });
    const world = buildJointStarForest({ ...valid, bodies: [] });
    expect(nodeById(world, "body:parent").edges.map((edge) => edge.child.id)).toEqual([
      "body:child",
    ]);
  });

  it("puts several roots under the one World node, in code point order", () => {
    const world = buildJointStarForest(
      starDocument({
        assemblies: ["a", "b"],
        bodies: [
          ["x", "a"],
          ["y", "a"],
          ["z", "b"],
          ["w", "b"],
        ],
        joints: [
          { id: "j2", parent: bodyEndpoint("z"), child: bodyEndpoint("w") },
          { id: "j1", parent: bodyEndpoint("x"), child: bodyEndpoint("y") },
        ],
      }),
    );
    expect(summary(world)).toEqual(["anchor:body:x", "anchor:body:z"]);
    expect(world.edges.every((edge) => !edge.driven)).toBe(true);
  });
});

describe("buildJointStarForest, real shapes", () => {
  it("builds the Translateur SCIE shape: 11 nodes folded, 62 unfolded", () => {
    const document = starDocument(scieFixture());
    const folded = buildJointStarForest(document);
    expect(allNodes(folded)).toHaveLength(11);
    const totalFollowing = allNodes(folded).reduce((sum, node) => sum + node.followingBodyCount, 0);
    expect(totalFollowing).toBe(51);
    const everyNode = new Set(allNodes(folded).map((node) => node.id));
    const unfolded = buildJointStarForest(document, everyNode);
    expect(allNodes(unfolded)).toHaveLength(62);
    expect(allNodes(unfolded).filter((node) => node.isFollowingLeaf)).toHaveLength(51);
    const joints = allNodes(unfolded).flatMap((node) =>
      node.edges.filter((edge) => edge.kind === "joint"),
    );
    expect(joints).toHaveLength(9);
  });

  it("shows a pre-0055 hub with 20 fixed joints on one body", () => {
    const bodies: [string, string][] = [["hub", "a"]];
    const joints = Array.from({ length: 20 }, (_, index) => {
      const id = `bolt${String(index).padStart(2, "0")}`;
      bodies.push([id, "a"]);
      return { id: `f${id}`, parent: bodyEndpoint("hub"), child: bodyEndpoint(id) };
    });
    const world = buildJointStarForest(starDocument({ assemblies: ["a"], bodies, joints }));
    const hub = world.edges[0]?.child;
    expect(hub?.edges).toHaveLength(20);
    expect(hub?.edges.every((edge) => edge.kind === "joint" && edge.jointType === "fixed")).toBe(
      true,
    );
  });
});

describe("buildJointStarForest, sub-assemblies", () => {
  it("places an unjointed sub-assembly of a moving group at World", () => {
    const world = buildJointStarForest(
      starDocument({
        assemblies: ["base", "arm", "tool"],
        bodies: [
          ["frame", "base"],
          ["arm-body", "arm"],
          ["tool-body", "tool"],
        ],
        joints: [
          {
            id: "swing",
            parent: bodyEndpoint("frame"),
            child: groupEndpoint("arm"),
            type: "revolute",
          },
          {
            id: "grip",
            parent: groupEndpoint("tool"),
            child: bodyEndpoint("tool-body"),
          },
        ],
      }),
    );
    // "tool" is a sub-assembly of "arm" in the structure tree but has no joint: it stays still.
    expect(summary(world)).toEqual(["anchor:assembly:tool", "anchor:body:frame"]);
    const arm = allNodes(world).find((node) => node.id === "assembly:arm");
    expect(arm?.followingBodyCount).toBe(1);
  });
});

describe("buildJointStarForest, following bodies", () => {
  it("makes a root body follow its group when that group is a node", () => {
    const world = buildJointStarForest(
      starDocument({
        assemblies: ["a", "g"],
        bodies: [
          ["frame", "a"],
          ["rod", "g"],
          ["hand", "g"],
        ],
        joints: [
          { id: "j1", parent: bodyEndpoint("frame"), child: groupEndpoint("g"), type: "revolute" },
          { id: "j2", parent: bodyEndpoint("rod"), child: bodyEndpoint("hand") },
        ],
      }),
    );
    const group = nodeById(world, "assembly:g");
    expect(summary(group)).toEqual(["follows:body:rod"]);
    expect(group.followingBodyCount).toBe(0);
  });

  it("folds and unfolds the following bodies of one node", () => {
    const document = starDocument(scieFixture());
    const unfolded = buildJointStarForest(document, new Set(["assembly:g3"]));
    const group = allNodes(unfolded).find((node) => node.id === "assembly:g3");
    expect(group?.unfolded).toBe(true);
    expect(group?.followingBodyCount).toBe(5);
    expect(group?.edges.filter((edge) => edge.kind === "follows")).toHaveLength(5);
    const other = allNodes(unfolded).find((node) => node.id === "assembly:g4");
    expect(other?.unfolded).toBe(false);
    expect(other?.followingBodyCount).toBe(5);
    expect(other?.edges.filter((edge) => edge.kind === "follows")).toHaveLength(0);
  });

  it("is deterministic whatever the order of the document", () => {
    const fixture = scieFixture();
    const reversed = {
      ...fixture,
      bodies: [...fixture.bodies].reverse(),
      joints: [...(fixture.joints ?? [])].reverse(),
    };
    const all = new Set(fixture.assemblies.map((key) => `assembly:${key}`));
    expect(buildJointStarForest(starDocument(reversed), all)).toEqual(
      buildJointStarForest(starDocument(fixture), all),
    );
  });
});
