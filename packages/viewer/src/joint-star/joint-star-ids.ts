import { assemblyNodeId, bodyNodeId, jointNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { WORLD_NODE_ID } from "./joint-star-forest.ts";

// The star's node ids carry no Pantin segment (joint-star-forest.ts); the tree's
// do. This is the one place that maps one to the other, so that a click on the
// star selects the same row as a click in the tree.

/** The tree row a star node stands for: World is the Pantin row. */
export function treeNodeIdOfStarNode(pantinId: string, starNodeId: string): string {
  if (starNodeId === WORLD_NODE_ID) {
    return pantinNodeId(pantinId);
  }
  const separator = starNodeId.indexOf(":");
  const kind = starNodeId.slice(0, separator);
  const rest = starNodeId.slice(separator + 1);
  return kind === "assembly" ? assemblyNodeId(pantinId, rest) : bodyNodeId(pantinId, rest);
}

/** The tree row of a joint, the one listed with the joints of its Pantin. */
export function treeNodeIdOfJoint(pantinId: string, jointId: string): string {
  return jointNodeId(pantinId, jointId);
}
