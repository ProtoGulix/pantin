import { bodyEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { starDocument } from "./joint-star-fixtures.ts";
import { buildJointStarForest } from "./joint-star-forest.ts";
import { layoutJointStar } from "./joint-star-layout.ts";
import { neighbourOf, starNeighbours } from "./joint-star-navigation.ts";

// World -> frame -> (arm, hand); the two children are siblings, arm before hand.
const layout = layoutJointStar(
  buildJointStarForest(
    starDocument({
      assemblies: ["a"],
      bodies: [
        ["frame", "a"],
        ["arm", "a"],
        ["hand", "a"],
      ],
      joints: [
        { id: "j1", parent: bodyEndpoint("frame"), child: bodyEndpoint("arm") },
        { id: "j2", parent: bodyEndpoint("frame"), child: bodyEndpoint("hand") },
      ],
    }),
  ),
);
const neighbours = starNeighbours(layout);

describe("starNeighbours", () => {
  it("goes from World to its first child and back to the parent", () => {
    expect(neighbourOf(neighbours, "world", "firstChild")).toBe("body:frame");
    expect(neighbourOf(neighbours, "body:frame", "parent")).toBe("world");
    expect(neighbourOf(neighbours, "world", "parent")).toBeNull();
  });

  it("goes to the first child of a node", () => {
    expect(neighbourOf(neighbours, "body:frame", "firstChild")).toBe("body:arm");
    expect(neighbourOf(neighbours, "body:arm", "firstChild")).toBeNull();
  });

  it("goes between siblings in layout order, without wrapping", () => {
    expect(neighbourOf(neighbours, "body:arm", "nextSibling")).toBe("body:hand");
    expect(neighbourOf(neighbours, "body:hand", "previousSibling")).toBe("body:arm");
    expect(neighbourOf(neighbours, "body:arm", "previousSibling")).toBeNull();
    expect(neighbourOf(neighbours, "body:hand", "nextSibling")).toBeNull();
  });

  it("knows no neighbour for an unknown node", () => {
    expect(neighbourOf(neighbours, "body:nothing", "parent")).toBeNull();
  });
});
