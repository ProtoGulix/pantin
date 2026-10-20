import type { DiagramNode } from "./diagram-types.ts";

// A node that matches the filter gets a second outline, outside the box. The
// box's own outline belongs to the selection (selected, related), so the two
// cues never override one another, and a selected match shows both.

const RING_OFFSET = 4;
const BOX_RADIUS = 6;

export function matchRing(node: Pick<DiagramNode, "x" | "y" | "width" | "height">) {
  return {
    x: node.x - RING_OFFSET,
    y: node.y - RING_OFFSET,
    width: node.width + 2 * RING_OFFSET,
    height: node.height + 2 * RING_OFFSET,
    rx: BOX_RADIUS + RING_OFFSET,
  };
}
