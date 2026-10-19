import type { PantinDocument } from "@pantin/protocol";
import { relatedJointIds } from "../device-selection.ts";
import { type Selection, selectedDeviceOf, selectedNodeIdsOf } from "../selection.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { WORLD_NODE_ID } from "./joint-star-forest.ts";
import type { StarLayout } from "./joint-star-layout.ts";

// What the selection made anywhere (tree, 3D view, diagram, inspector) marks in
// the joint star (ADR 0059 point 6). Pure. An edge is named by its child node:
// a tree has one parent edge per node, so the child id is its identity.

export interface StarHighlight {
  selectedNodeIds: ReadonlySet<string>;
  // Child node ids of the selected edges (the joints).
  selectedEdgeIds: ReadonlySet<string>;
  // The ancestors of what is selected, up to World, and the edges that join them.
  pathNodeIds: ReadonlySet<string>;
  pathEdgeIds: ReadonlySet<string>;
}

export const NO_STAR_HIGHLIGHT: StarHighlight = {
  selectedNodeIds: new Set(),
  selectedEdgeIds: new Set(),
  pathNodeIds: new Set(),
  pathEdgeIds: new Set(),
};

interface Selected {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

// A body that is not a node of the star follows its group, or stays at World.
function starNodeOfBody(document: PantinDocument, layout: StarLayout, bodyId: string): string {
  const own = `body:${bodyId}`;
  if (layout.nodes.some((node) => node.id === own)) {
    return own;
  }
  const assembly = document.bodies.find((body) => body.id === bodyId)?.assembly;
  const group = `assembly:${assembly}`;
  return layout.nodes.some((node) => node.id === group) ? group : WORLD_NODE_ID;
}

function selectTreeNode(
  nodeId: string,
  document: PantinDocument,
  layout: StarLayout,
  selected: Selected,
): void {
  const ref = parseNodeId(nodeId);
  if (ref?.kind === "pantin") {
    selected.nodeIds.add(WORLD_NODE_ID);
  } else if (ref?.kind === "assembly") {
    const group = `assembly:${ref.key}`;
    if (layout.nodes.some((node) => node.id === group)) {
      selected.nodeIds.add(group);
    }
  } else if (ref?.kind === "body" || ref?.kind === "sourceNode") {
    selected.nodeIds.add(starNodeOfBody(document, layout, ref.bodyId));
  } else if (ref?.kind === "joint") {
    selectJoint(ref.jointId, layout, selected);
  }
}

function selectJoint(jointId: string, layout: StarLayout, selected: Selected): void {
  for (const edge of layout.edges) {
    if (edge.jointId === jointId) {
      selected.edgeIds.add(edge.childId);
    }
  }
}

function pathToWorld(layout: StarLayout, selected: Selected): StarHighlight {
  const parentOf = new Map(layout.edges.map((edge) => [edge.childId, edge.parentId]));
  const pathNodeIds = new Set<string>();
  const pathEdgeIds = new Set<string>();
  // An edge starts its walk at its parent: the edge itself is selected, not on the path.
  const starts = [
    ...selected.nodeIds,
    ...[...selected.edgeIds].map((childId) => parentOf.get(childId) ?? WORLD_NODE_ID),
  ];
  for (const start of starts) {
    let current: string | undefined = start;
    while (current !== undefined && !pathNodeIds.has(current)) {
      pathNodeIds.add(current);
      const parent = parentOf.get(current);
      if (parent !== undefined) {
        pathEdgeIds.add(current);
      }
      current = parent;
    }
  }
  for (const id of selected.nodeIds) {
    pathNodeIds.delete(id);
  }
  for (const id of selected.edgeIds) {
    pathEdgeIds.delete(id);
  }
  return {
    selectedNodeIds: selected.nodeIds,
    selectedEdgeIds: selected.edgeIds,
    pathNodeIds,
    pathEdgeIds,
  };
}

/**
 * The tree rows selected, or the joints of the selected drive, actuator or
 * sensor, as nodes and edges of the star, with their path to World.
 */
export function starHighlight(
  document: PantinDocument,
  layout: StarLayout,
  selection: Selection | null,
  multiSelectedNodeIds: readonly string[],
): StarHighlight {
  const selected: Selected = { nodeIds: new Set(), edgeIds: new Set() };
  const device = selectedDeviceOf(selection);
  if (device !== null) {
    for (const jointId of relatedJointIds(document, device)) {
      selectJoint(jointId, layout, selected);
    }
  }
  for (const nodeId of selectedNodeIdsOf(selection, multiSelectedNodeIds)) {
    selectTreeNode(nodeId, document, layout, selected);
  }
  return selected.nodeIds.size + selected.edgeIds.size === 0
    ? NO_STAR_HIGHLIGHT
    : pathToWorld(layout, selected);
}
