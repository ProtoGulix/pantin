import type { ForestNode } from "./diagram-forest.ts";
import type { ChainDiagram, Socket } from "./diagram-types.ts";

// The filter of the chain diagram (ADR 0029): the text the user typed, matched
// against the name of a node and the full name of its tags. A chain is the unit
// that stays on screen, so that a match is shown with what feeds it and what it
// feeds; the matching nodes themselves are marked by the view.

/** Lower case without accents, so that "tapis" finds "Tapis" and "capteur" finds "Capteur". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** The text to look for, or null when the filter is empty and every chain stays. */
export function filterNeedle(query: string): string | null {
  const needle = normalize(query.trim());
  return needle === "" ? null : needle;
}

function tagNamesOf(sockets: readonly Pick<Socket, "tagName">[]): string[] {
  return sockets.flatMap((socket) => (socket.tagName === undefined ? [] : [socket.tagName]));
}

function matches(label: string, tagNames: readonly string[], needle: string): boolean {
  return [label, ...tagNames].some((text) => normalize(text).includes(needle));
}

function forestNodeMatches(node: ForestNode, needle: string): boolean {
  return matches(node.label, tagNamesOf([...node.sockets.left, ...node.sockets.right]), needle);
}

function subtreeMatches(node: ForestNode, needle: string): boolean {
  return (
    forestNodeMatches(node, needle) || node.children.some((child) => subtreeMatches(child, needle))
  );
}

/** The chains (roots with their descendants) that hold at least one node matching the query. */
export function filterForest(roots: readonly ForestNode[], query: string): ForestNode[] {
  const needle = filterNeedle(query);
  return needle === null ? [...roots] : roots.filter((root) => subtreeMatches(root, needle));
}

/** The ids of the drawn nodes that match the query; empty for an empty query. */
export function matchingNodeIds(diagram: ChainDiagram, query: string): Set<string> {
  const needle = filterNeedle(query);
  if (needle === null) {
    return new Set();
  }
  return new Set(
    diagram.nodes
      .filter((node) => matches(node.label, tagNamesOf(node.sockets), needle))
      .map((node) => node.id),
  );
}
