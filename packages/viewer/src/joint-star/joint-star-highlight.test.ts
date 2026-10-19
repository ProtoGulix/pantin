import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { nodeSelection } from "../selection.ts";
import { scieFixture, starDocument } from "./joint-star-fixtures.ts";
import { buildJointStarForest } from "./joint-star-forest.ts";
import { NO_STAR_HIGHLIGHT, starHighlight } from "./joint-star-highlight.ts";
import { layoutJointStar } from "./joint-star-layout.ts";

// World -> frame (anchor) -> slide (prismatic j1, driven) -> tip (revolute j2); "loose" follows World.
const document = starDocument({
  assemblies: ["a"],
  bodies: [
    ["frame", "a"],
    ["slide", "a"],
    ["tip", "a"],
    ["loose", "a"],
  ],
  joints: [
    { id: "j1", parent: bodyEndpoint("frame"), child: bodyEndpoint("slide"), type: "prismatic" },
    { id: "j2", parent: bodyEndpoint("slide"), child: bodyEndpoint("tip"), type: "revolute" },
  ],
  drivenJoints: ["j1"],
});
const layout = layoutJointStar(buildJointStarForest(document));

const highlightOf = (nodeId: string) => starHighlight(document, layout, nodeSelection(nodeId), []);

describe("starHighlight", () => {
  it("marks nothing without a selection", () => {
    expect(starHighlight(document, layout, null, [])).toBe(NO_STAR_HIGHLIGHT);
  });

  it("marks a selected body and its path to World, edges included", () => {
    const highlight = highlightOf("body:p:tip");
    expect([...highlight.selectedNodeIds]).toEqual(["body:tip"]);
    expect([...highlight.pathNodeIds].sort()).toEqual(["body:frame", "body:slide", "world"]);
    // The edges are named by their child; the selected body's own parent edge is on the path.
    expect([...highlight.pathEdgeIds].sort()).toEqual(["body:frame", "body:slide", "body:tip"]);
  });

  it("marks a selected joint as an edge, with the path from its parent", () => {
    const highlight = highlightOf("joint:p:j2:slide");
    expect([...highlight.selectedEdgeIds]).toEqual(["body:tip"]);
    expect(highlight.selectedNodeIds.size).toBe(0);
    expect([...highlight.pathNodeIds].sort()).toEqual(["body:frame", "body:slide", "world"]);
  });

  it("marks World for the Pantin row, and for a body that follows no group", () => {
    expect([...highlightOf("pantin:p").selectedNodeIds]).toEqual(["world"]);
    expect([...highlightOf("body:p:loose").selectedNodeIds]).toEqual(["world"]);
    expect(highlightOf("pantin:p").pathNodeIds.size).toBe(0);
  });

  it("marks the joints an actuator moves when a device is selected", () => {
    const highlight = starHighlight(document, layout, { kind: "actuator", id: "motor" }, []);
    expect([...highlight.selectedEdgeIds]).toEqual(["body:slide"]);
  });

  it("marks every row of a multi-selection", () => {
    const highlight = starHighlight(document, layout, nodeSelection("body:p:frame"), [
      "body:p:frame",
      "body:p:tip",
    ]);
    expect([...highlight.selectedNodeIds].sort()).toEqual(["body:frame", "body:tip"]);
  });
});

describe("starHighlight on groups", () => {
  it("shows a body that follows a group on that group's node", () => {
    const fixture = scieFixture();
    const scie = starDocument(fixture);
    const scieLayout = layoutJointStar(buildJointStarForest(scie));
    const highlight = starHighlight(scie, scieLayout, nodeSelection("body:p:b03"), []);
    expect([...highlight.selectedNodeIds]).toEqual(["assembly:g3"]);
  });

  it("ignores an assembly that is not a group", () => {
    const grouped = starDocument({
      assemblies: ["a", "b"],
      bodies: [["x", "b"]],
      joints: [],
    });
    const flat = layoutJointStar(buildJointStarForest(grouped));
    const highlight = starHighlight(grouped, flat, nodeSelection("assembly:p:b"), []);
    expect(highlight).toBe(NO_STAR_HIGHLIGHT);
  });

  it("follows a group joint", () => {
    const groups = starDocument({
      assemblies: ["g0", "g1"],
      bodies: [["x", "g1"]],
      joints: [{ id: "w", parent: groupEndpoint("g0"), child: groupEndpoint("g1") }],
    });
    const groupLayout = layoutJointStar(buildJointStarForest(groups));
    const highlight = starHighlight(groups, groupLayout, nodeSelection("assembly:p:g1"), []);
    expect([...highlight.pathNodeIds].sort()).toEqual(["assembly:g0", "world"]);
  });
});
