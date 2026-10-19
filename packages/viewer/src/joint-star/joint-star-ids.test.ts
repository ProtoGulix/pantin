import { describe, expect, it } from "vitest";
import { parseNodeId } from "../tree/node-ids.ts";
import { treeNodeIdOfJoint, treeNodeIdOfStarNode } from "./joint-star-ids.ts";

describe("star ids", () => {
  it("maps star nodes to the tree's node ids", () => {
    expect(treeNodeIdOfStarNode("p", "world")).toBe("pantin:p");
    expect(treeNodeIdOfStarNode("p", "assembly:g1")).toBe("assembly:p:g1");
    expect(treeNodeIdOfStarNode("p", "body:b-1")).toBe("body:p:b-1");
  });

  it("maps a joint to its row, which the tree parses back", () => {
    expect(treeNodeIdOfJoint("p", "j1")).toBe("joint:p:j1");
    expect(parseNodeId(treeNodeIdOfJoint("p", "j1"))).toMatchObject({
      kind: "joint",
      jointId: "j1",
    });
  });
});
