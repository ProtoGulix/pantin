import type { Joint, JointEndpoint, JointType, PantinDocument } from "@pantin/protocol";
import { actuatorOfJoint } from "../actuators/actuator-joints.ts";

// The kinematic forest of a document, as the joint star view shows it (ADR
// 0059 points 2 and 3). It mirrors computeDisplacements in
// packages/core/src/domain/kinematics.ts and computes no pose: a link with a
// parent joint hangs from that joint's parent; a body without one follows its
// own assembly when that assembly is a group, else it does not move; a group
// without a parent joint does not move either. An unjointed sub-assembly
// inside a moving group therefore hangs from World, not from the group above
// it: the structure tree carries no motion (ADR 0055 point 5).

export const WORLD_NODE_ID = "world";

export type StarNodeKind = "world" | "group" | "body";
export type StarEdgeKind = "joint" | "follows" | "anchor";

interface StarEdge {
  kind: StarEdgeKind;
  // Joint edges only.
  jointId: string | undefined;
  jointType: JointType | undefined;
  jointName: string | undefined;
  // The joint is moved by an actuator.
  driven: boolean;
  child: StarNode;
}

export interface StarNode {
  // "world", "assembly:<key>" or "body:<id>": the tree's node ids without the Pantin id.
  id: string;
  kind: StarNodeKind;
  // The assembly key or the body id; empty for World.
  elementId: string;
  label: string;
  // Bodies that follow this node without being endpoints of a joint, folded or not.
  followingBodyCount: number;
  // Following bodies shown as leaves; false for a folded node.
  unfolded: boolean;
  // A body shown only because its node was unfolded.
  isFollowingLeaf: boolean;
  // Joint edges, then follows edges, then anchor edges, each by code point id order.
  edges: StarEdge[];
}

/** Ids of the nodes whose following bodies are shown; the default is none. */
export type UnfoldedNodeIds = ReadonlySet<string>;

function groupNodeId(key: string): string {
  return `assembly:${key}`;
}

function bodyNodeId(id: string): string {
  return `body:${id}`;
}

function endpointNodeId(endpoint: JointEndpoint): string {
  return endpoint.kind === "body" ? bodyNodeId(endpoint.id) : groupNodeId(endpoint.key);
}

// Code point order, not locale order, so that the layout does not depend on the browser.
function compareCodePoints(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

function emptyNode(id: string, kind: StarNodeKind, elementId: string, label: string): StarNode {
  return {
    id,
    kind,
    elementId,
    label,
    followingBodyCount: 0,
    unfolded: false,
    isFollowingLeaf: false,
    edges: [],
  };
}

function endpointNodes(document: PantinDocument): Map<string, StarNode> {
  const nodes = new Map<string, StarNode>([
    [WORLD_NODE_ID, emptyNode(WORLD_NODE_ID, "world", "", "")],
  ]);
  const assemblyNames = new Map(document.assemblies.map((entry) => [entry.key, entry.name]));
  const bodyNames = new Map(document.bodies.map((body) => [body.id, body.name]));
  for (const joint of document.joints) {
    for (const endpoint of [joint.parent, joint.child]) {
      const id = endpointNodeId(endpoint);
      if (nodes.has(id)) {
        continue;
      }
      nodes.set(
        id,
        endpoint.kind === "body"
          ? emptyNode(id, "body", endpoint.id, bodyNames.get(endpoint.id) ?? endpoint.id)
          : emptyNode(id, "group", endpoint.key, assemblyNames.get(endpoint.key) ?? endpoint.key),
      );
    }
  }
  return nodes;
}

// The node a link without a parent joint hangs from, and how.
function implicitParent(
  node: StarNode,
  assemblyOfBody: ReadonlyMap<string, string>,
  nodes: ReadonlyMap<string, StarNode>,
): { parent: StarNode; kind: "follows" | "anchor" } | undefined {
  const world = nodes.get(WORLD_NODE_ID);
  const group =
    node.kind === "body"
      ? nodes.get(groupNodeId(assemblyOfBody.get(node.elementId) ?? ""))
      : undefined;
  if (group !== undefined) {
    return { parent: group, kind: "follows" };
  }
  return world === undefined ? undefined : { parent: world, kind: "anchor" };
}

function edgeTo(child: StarNode, kind: StarEdgeKind, joint?: Joint, driven = false): StarEdge {
  return {
    kind,
    jointId: joint?.id,
    jointType: joint?.type,
    jointName: joint?.name,
    driven,
    child,
  };
}

function attachLinks(document: PantinDocument, nodes: ReadonlyMap<string, StarNode>): void {
  const assemblyOfBody = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const parentJointOf = new Map(
    document.joints.map((joint) => [endpointNodeId(joint.child), joint]),
  );
  for (const node of nodes.values()) {
    if (node.kind === "world") {
      continue;
    }
    const joint = parentJointOf.get(node.id);
    const jointParent = joint === undefined ? undefined : nodes.get(endpointNodeId(joint.parent));
    if (joint !== undefined && jointParent !== undefined) {
      jointParent.edges.push(
        edgeTo(node, "joint", joint, actuatorOfJoint(document, joint.id) !== undefined),
      );
      continue;
    }
    const implicit = implicitParent(node, assemblyOfBody, nodes);
    implicit?.parent.edges.push(edgeTo(node, implicit.kind));
  }
}

// Bodies that are not joint endpoints follow their group, or stay at World.
function countFollowingBodies(
  document: PantinDocument,
  nodes: ReadonlyMap<string, StarNode>,
  unfolded: UnfoldedNodeIds,
): void {
  for (const body of document.bodies) {
    if (nodes.has(bodyNodeId(body.id))) {
      continue;
    }
    const owner = nodes.get(groupNodeId(body.assembly)) ?? nodes.get(WORLD_NODE_ID);
    if (owner === undefined) {
      continue;
    }
    owner.followingBodyCount += 1;
    if (unfolded.has(owner.id)) {
      const leaf = emptyNode(bodyNodeId(body.id), "body", body.id, body.name);
      leaf.isFollowingLeaf = true;
      owner.edges.push(edgeTo(leaf, "follows"));
    }
  }
  for (const node of nodes.values()) {
    node.unfolded = unfolded.has(node.id) && node.followingBodyCount > 0;
  }
}

const EDGE_RANK: Record<StarEdgeKind, number> = { joint: 0, follows: 1, anchor: 2 };

function compareEdges(first: StarEdge, second: StarEdge): number {
  return (
    EDGE_RANK[first.kind] - EDGE_RANK[second.kind] ||
    compareCodePoints(first.jointId ?? first.child.id, second.jointId ?? second.child.id) ||
    compareCodePoints(first.child.id, second.child.id)
  );
}

function sortEdges(nodes: Iterable<StarNode>): void {
  for (const node of nodes) {
    node.edges.sort(compareEdges);
  }
}

/**
 * The forest rooted at World (ADR 0059 point 3). Nodes are the groups and the
 * bodies that are endpoints of a joint; `unfolded` lists the nodes whose
 * following bodies are shown as leaves. A joint whose endpoints are unknown to
 * the document still gets nodes, because the core, not the view, judges validity.
 */
export function buildJointStarForest(
  document: PantinDocument,
  unfolded: UnfoldedNodeIds = new Set(),
): StarNode {
  const nodes = endpointNodes(document);
  attachLinks(document, nodes);
  countFollowingBodies(document, nodes, unfolded);
  sortEdges(nodes.values());
  // World always exists: endpointNodes seeds it.
  return nodes.get(WORLD_NODE_ID) ?? emptyNode(WORLD_NODE_ID, "world", "", "");
}
