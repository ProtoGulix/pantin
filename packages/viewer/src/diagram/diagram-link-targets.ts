import type { PantinDocument } from "@pantin/protocol";
import type { ChainDiagram, DiagramEdge, DiagramNode } from "./diagram-types.ts";
import { type EditResult, type Endpoint, linkBetween, splitNodeId } from "./diagram-wiring.ts";

// Where a link can end (ADR 0029 points 6 and 7), for the pointer's highlight
// and for the keyboard's "Relier à…" list. The same function judges both, so
// the two ways of wiring never disagree.

export interface LinkTarget {
  endpoint: Endpoint;
  result: EditResult;
}

// A joint is a target as a whole: whatever part of it is reached, it stands
// for the actuator's "in" or the sensor's "out" side alike.
function endpointsOf(node: DiagramNode): Endpoint[] {
  const sockets = node.kind === "joint" ? node.sockets.slice(0, 1) : node.sockets;
  return sockets
    .filter((socket) => socket.role !== "command" && socket.role !== "feedback")
    .map((socket) => ({ nodeId: node.id, socketId: socket.id }));
}

/**
 * Every socket that pairs with this one: allowed ones carry the edit, refused
 * ones the reason (dimmed on screen, and told when dropped on). Sockets that
 * could never pair (two drives) are left out.
 */
export function linkTargets(
  document: PantinDocument,
  diagram: ChainDiagram,
  from: Endpoint,
): LinkTarget[] {
  return diagram.nodes
    .flatMap(endpointsOf)
    .map((endpoint) => ({ endpoint, result: linkBetween(document, from, endpoint) }))
    .filter(({ result }) => result.ok || result.linkable);
}

export interface LinkChoice {
  endpoint: Endpoint;
  // "Valve 1 · port_4", or the node's name alone for a single-link node.
  label: string;
}

/** The menu of "Relier à…": the targets the core would accept. */
export function linkChoices(
  document: PantinDocument,
  diagram: ChainDiagram,
  from: Endpoint,
): LinkChoice[] {
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  return linkTargets(document, diagram, from)
    .filter(({ result }) => result.ok)
    .map(({ endpoint }) => {
      const node = nodes.get(endpoint.nodeId);
      const socket = node?.sockets.find((candidate) => candidate.id === endpoint.socketId);
      const name = node?.label ?? splitNodeId(endpoint.nodeId).id;
      return {
        endpoint,
        label: socket === undefined || socket.label === "" ? name : `${name} · ${socket.label}`,
      };
    });
}

/**
 * The ends a link can be dragged from: a drive's output port, an actuator's
 * right anchor (towards its joints) and a sensor's left anchor (to the joint
 * it watches). Other sockets are where links end.
 */
export function isDragSource(endpoint: Endpoint): boolean {
  const { kind } = splitNodeId(endpoint.nodeId);
  return (
    (kind === "drive" && endpoint.socketId.startsWith("out:")) ||
    (kind === "actuator" && endpoint.socketId === "out") ||
    (kind === "sensor" && endpoint.socketId === "in")
  );
}

/** A sensor's link can be grabbed by its wire: the end to move is the sensor's. */
export function edgeDragSource(edge: DiagramEdge): Endpoint | null {
  return edge.kind === "observation" ? { nodeId: edge.toNode, socketId: edge.toSocket } : null;
}
