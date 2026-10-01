import type { PantinDocument } from "@pantin/protocol";
import { selectedBodyIds } from "../assembly-display.ts";
import { deviceNodeId } from "../device-selection.ts";
import { type Selection, selectedDeviceOf, selectedNodeIdOf } from "../selection.ts";
import { jointNodeId, parseNodeId } from "../tree/node-ids.ts";
import {
  type ChainLinks,
  chainNodeIdsOfBodies,
  chainOfNode,
  downstreamBodyIds,
  jointNode,
} from "./diagram-chains.ts";
import type { ChainDiagram } from "./diagram-types.ts";

// Selection shared between the tree, the 3D view and the diagram (ADR 0029
// point 9, ADR 0030 point 1), as pure functions. A joint node selects its tree
// row; a drive, an actuator or a sensor is itself the selection.

export type NodeHighlight = "selected" | "related";

const JOINT_PREFIX = "joint:";

/** The tree row a click on a joint node selects, or null for a node that is no joint. */
export function treeNodeForJointNode(
  links: ChainLinks,
  pantinId: string,
  diagramNodeId: string,
): string | null {
  const childBody = links.bodyOfJoint.get(diagramNodeId);
  return childBody === undefined
    ? null
    : jointNodeId(pantinId, diagramNodeId.slice(JOINT_PREFIX.length), childBody);
}

// The selected device, or a joint selected in the tree, as a node of the
// diagram, when the diagram draws it.
function selectedChainNode(links: ChainLinks, selection: Selection | null): string | null {
  const selectedDevice = selectedDeviceOf(selection);
  if (selectedDevice !== null) {
    const node = deviceNodeId(selectedDevice);
    return links.nodeIds.has(node) ? node : null;
  }
  const nodeId = selectedNodeIdOf(selection);
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  if (ref?.kind !== "joint") {
    return null;
  }
  const node = jointNode(ref.jointId);
  return links.nodeIds.has(node) ? node : null;
}

/** What each diagram node looks like for the current selection. */
export function diagramHighlight(
  document: PantinDocument,
  links: ChainLinks,
  selection: Selection | null,
): Map<string, NodeHighlight> {
  const chosen = selectedChainNode(links, selection);
  if (chosen !== null) {
    const highlight = new Map<string, NodeHighlight>(
      [...chainOfNode(links, chosen)].map((id) => [id, "related"]),
    );
    return highlight.set(chosen, "selected");
  }
  const bodies = selectedBodyIds(document, selectedNodeIdOf(selection));
  return new Map([...chainNodeIdsOfBodies(links, bodies)].map((id) => [id, "related"]));
}

/** The bodies the 3D view tints: those moved downstream of the selected device or joint, else the tree's. */
export function highlightedBodyIds(
  document: PantinDocument,
  links: ChainLinks,
  selection: Selection | null,
): Set<string> {
  // A joint selected in the tree tints its child, like the same joint clicked in the diagram.
  const selectedDevice = selectedDeviceOf(selection);
  const chosen = selectedChainNode(links, selection);
  if (selectedDevice !== null) {
    // A sensor on a fixed joint is no diagram node, and moves nothing.
    return chosen === null ? new Set() : downstreamBodyIds(links, chosen);
  }
  return chosen === null
    ? selectedBodyIds(document, selectedNodeIdOf(selection))
    : downstreamBodyIds(links, chosen);
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
