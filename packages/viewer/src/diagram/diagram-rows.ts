import {
  MIN_ROW_GAP,
  MIN_ROW_PITCH,
  NODE_BOTTOM_PADDING,
  NODE_TITLE_HEIGHT,
  SOCKET_PITCH,
} from "./diagram-constants.ts";
import type { ForestNode } from "./diagram-forest.ts";

// Rows inside a band (ADR 0029 point 3): every leaf of the forest takes the
// next row, a parent sits at the middle of its first and last child. Subtrees
// then own consecutive rows, which is what keeps edges from crossing.

export function nodeHeight(node: ForestNode): number {
  const lines = Math.max(node.sockets.left.length, node.sockets.right.length, 1);
  return NODE_TITLE_HEIGHT + lines * SOCKET_PITCH + NODE_BOTTOM_PADDING;
}

function allNodes(roots: readonly ForestNode[]): ForestNode[] {
  return roots.flatMap((root) => [root, ...allNodes(root.children)]);
}

/**
 * The height of one row: the tallest node plus a gap. A node centred on its
 * rows then stays inside them, so two nodes of a column never overlap.
 */
export function rowPitch(roots: readonly ForestNode[]): number {
  const tallest = Math.max(0, ...allNodes(roots).map(nodeHeight));
  return Math.max(MIN_ROW_PITCH, tallest + MIN_ROW_GAP);
}

export interface RowPlacement {
  // Vertical centre of each node, in rows from the top of the band's body.
  centres: Map<ForestNode, number>;
  // Index of the first leaf row of each node's subtree: its row in reading order.
  firstRows: Map<ForestNode, number>;
  rowCount: number;
}

export function placeRows(roots: readonly ForestNode[]): RowPlacement {
  const centres = new Map<ForestNode, number>();
  const firstRows = new Map<ForestNode, number>();
  let nextRow = 0;
  const visit = (node: ForestNode): number => {
    firstRows.set(node, nextRow);
    let centre: number;
    if (node.children.length === 0) {
      centre = nextRow + 0.5;
      nextRow += 1;
    } else {
      const childCentres = node.children.map(visit);
      centre = ((childCentres[0] ?? 0) + (childCentres.at(-1) ?? 0)) / 2;
    }
    centres.set(node, centre);
    return centre;
  };
  for (const root of roots) {
    visit(root);
  }
  return { centres, firstRows, rowCount: nextRow };
}
