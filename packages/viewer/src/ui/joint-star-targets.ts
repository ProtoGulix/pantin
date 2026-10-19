import { treeNodeIdOfJoint, treeNodeIdOfStarNode } from "../joint-star/joint-star-ids.ts";
import type { DrawnStar } from "./joint-star-draw.ts";

// What is under the pointer in the joint tree, as the tree rows the intents work on
// (ADR 0059 point 6): a node is its own row, a joint edge is the row of its joint.

export interface StarTarget {
  // The tree row to select, or to open the context menu on.
  row: string;
  // The row to frame in the 3D view: the node itself, or the child of a joint.
  framedRow: string;
}

export function starTargetAt(
  target: Element | null,
  pantinId: string,
  drawn: DrawnStar,
): StarTarget | null {
  const nodeId = target?.closest("[data-node-id]")?.getAttribute("data-node-id");
  if (nodeId !== null && nodeId !== undefined) {
    const row = treeNodeIdOfStarNode(pantinId, nodeId);
    return { row, framedRow: row };
  }
  const childId = target?.closest("[data-edge-id]")?.getAttribute("data-edge-id");
  const jointId =
    childId === null || childId === undefined ? undefined : drawn.edges.get(childId)?.jointId;
  if (childId === null || childId === undefined || jointId === undefined) {
    return null;
  }
  return {
    row: treeNodeIdOfJoint(pantinId, jointId),
    framedRow: treeNodeIdOfStarNode(pantinId, childId),
  };
}
