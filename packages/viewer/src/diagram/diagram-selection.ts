import type { PantinDocument } from "@pantin/protocol";
import { selectedBodyIds } from "../assembly-display.ts";
import { jointNodeId, pantinNodeId, parseNodeId } from "../tree/node-ids.ts";
import {
  chainLinks,
  chainNodeIdsOfBodies,
  chainOfNode,
  descendantsOf,
  downstreamBodyIds,
  jointNode,
} from "./diagram-chains.ts";
import type { ChainDiagram } from "./diagram-types.ts";

// Selection shared between the tree, the 3D view and the diagram (ADR 0029
// point 9), as pure functions. The tree has no row for a drive, an actuator or
// a sensor, so a click on such a node selects the closest tree row: the first
// joint downstream (the watched joint for a sensor), or the Pantin when there
// is none. The diagram remembers which node was clicked; that memory only
// counts while the tree still selects the row that click chose.

export type NodeHighlight = "selected" | "related";

const JOINT_PREFIX = "joint:";

/** The tree row a click on a diagram node selects. */
export function treeNodeForDiagramNode(
  document: PantinDocument,
  pantinId: string,
  diagramNodeId: string,
): string {
  const links = chainLinks(document);
  const start = diagramNodeId.startsWith("sensor:")
    ? (links.parent.get(diagramNodeId) ?? diagramNodeId)
    : diagramNodeId;
  const joint = [start, ...descendantsOf(links, start)].find((id) => links.bodyOfJoint.has(id));
  const childBody = joint === undefined ? undefined : links.bodyOfJoint.get(joint);
  return joint === undefined || childBody === undefined
    ? pantinNodeId(pantinId)
    : jointNodeId(pantinId, joint.slice(JOINT_PREFIX.length), childBody);
}

interface Selections {
  selectedNodeId: string | null;
  diagramNodeId: string | null;
}

/**
 * The clicked diagram node, while the tree still selects the row that click
 * chose; any other selection (tree, 3D view) takes over.
 */
function activeDiagramNode(
  document: PantinDocument,
  pantinId: string,
  selections: Selections,
): string | null {
  const { selectedNodeId, diagramNodeId } = selections;
  if (diagramNodeId === null || !chainLinks(document).nodeIds.has(diagramNodeId)) {
    return null;
  }
  const chosen = treeNodeForDiagramNode(document, pantinId, diagramNodeId);
  return chosen === selectedNodeId ? diagramNodeId : null;
}

// A joint selected in the tree is a node of the diagram too.
function selectedJointNode(document: PantinDocument, selectedNodeId: string | null): string | null {
  const ref = selectedNodeId === null ? null : parseNodeId(selectedNodeId);
  const node = ref?.kind === "joint" ? jointNode(ref.jointId) : null;
  return node !== null && chainLinks(document).nodeIds.has(node) ? node : null;
}

/** What each diagram node looks like for the current selection. */
export function diagramHighlight(
  document: PantinDocument,
  pantinId: string,
  selections: Selections,
): Map<string, NodeHighlight> {
  const chosen =
    activeDiagramNode(document, pantinId, selections) ??
    selectedJointNode(document, selections.selectedNodeId);
  if (chosen !== null) {
    const highlight = new Map<string, NodeHighlight>(
      [...chainOfNode(document, chosen)].map((id) => [id, "related"]),
    );
    return highlight.set(chosen, "selected");
  }
  const bodies = selectedBodyIds(document, selections.selectedNodeId);
  return new Map([...chainNodeIdsOfBodies(document, bodies)].map((id) => [id, "related"]));
}

/** The bodies the 3D view tints: those moved downstream of a clicked diagram node, else the tree's. */
export function highlightedBodyIds(
  document: PantinDocument,
  pantinId: string,
  selections: Selections,
): Set<string> {
  // A joint selected in the tree tints its child, like the same joint clicked in the diagram.
  const chosen =
    activeDiagramNode(document, pantinId, selections) ??
    selectedJointNode(document, selections.selectedNodeId);
  return chosen === null
    ? selectedBodyIds(document, selections.selectedNodeId)
    : downstreamBodyIds(document, chosen);
}

/** The wires of a chain: both their ends are highlighted. */
export function relatedEdgeIds(
  diagram: ChainDiagram | null,
  highlight: ReadonlyMap<string, NodeHighlight>,
): Set<string> {
  const edges = diagram?.edges ?? [];
  return new Set(
    edges
      .filter((edge) => highlight.has(edge.fromNode) && highlight.has(edge.toNode))
      .map((edge) => edge.id),
  );
}
