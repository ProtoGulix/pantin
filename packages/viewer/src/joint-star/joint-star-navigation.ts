import type { StarLayout } from "./joint-star-layout.ts";

// The keyboard moves along the tree (ADR 0059 point 6): Left to the parent,
// Right to the first child, Up and Down to the previous and next sibling.
// Pure: the view only asks which node to focus.

export type StarDirection = "parent" | "firstChild" | "previousSibling" | "nextSibling";

interface Neighbours {
  parent: string | null;
  firstChild: string | null;
  previousSibling: string | null;
  nextSibling: string | null;
}

export type StarNeighbours = ReadonlyMap<string, Neighbours>;

/** The neighbours of every node; siblings keep the layout's clockwise order and do not wrap. */
export function starNeighbours(layout: StarLayout): StarNeighbours {
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const edge of layout.edges) {
    parentOf.set(edge.childId, edge.parentId);
    childrenOf.set(edge.parentId, [...(childrenOf.get(edge.parentId) ?? []), edge.childId]);
  }
  const result = new Map<string, Neighbours>();
  for (const node of layout.nodes) {
    const parent = parentOf.get(node.id) ?? null;
    const siblings = parent === null ? [] : (childrenOf.get(parent) ?? []);
    const index = siblings.indexOf(node.id);
    result.set(node.id, {
      parent,
      firstChild: childrenOf.get(node.id)?.[0] ?? null,
      previousSibling: index > 0 ? (siblings[index - 1] ?? null) : null,
      nextSibling: index >= 0 ? (siblings[index + 1] ?? null) : null,
    });
  }
  return result;
}

/** The node to focus after an arrow key, or null when there is none that way. */
export function neighbourOf(
  neighbours: StarNeighbours,
  nodeId: string,
  direction: StarDirection,
): string | null {
  return neighbours.get(nodeId)?.[direction] ?? null;
}

/** The arrow keys the view listens to. */
export const ARROW_DIRECTIONS: Readonly<Record<string, StarDirection>> = {
  ArrowLeft: "parent",
  ArrowRight: "firstChild",
  ArrowUp: "previousSibling",
  ArrowDown: "nextSibling",
};
