import type { ChainDiagram, DiagramEdge, DiagramNode, Socket } from "./diagram-types.ts";

// Keyboard navigation of the diagram (ADR 0029 point 7), as pure functions:
// which nodes and ports take the focus, in which order, and where an arrow
// key goes. The layout emits nodes in reading order (band, row, column), so
// that order is the focus order; a node's ports follow it, left side first.

export interface FocusTarget {
  nodeId: string;
  // Null for the node itself.
  socketId: string | null;
}

export type Direction = "left" | "right" | "up" | "down";

export const focusKeyOf = (target: FocusTarget): string =>
  target.socketId === null ? `node:${target.nodeId}` : `port:${target.nodeId}|${target.socketId}`;

// A sensor's tag only shows a value, which a screen reader gets from its node;
// the ports and the command tags (forced from the keyboard, ADR 0030 point 3)
// take the focus.
const takesFocus = (socket: Socket): boolean => socket.role !== "feedback";

function portsOf(node: DiagramNode): Socket[] {
  const ports = node.sockets.filter(takesFocus);
  return [
    ...ports.filter((port) => port.side === "left"),
    ...ports.filter((port) => port.side === "right"),
  ];
}

/** Every node and port, in reading order. */
export function focusTargets(diagram: ChainDiagram): FocusTarget[] {
  return diagram.nodes.flatMap((node) => [
    { nodeId: node.id, socketId: null },
    ...portsOf(node).map((port) => ({ nodeId: node.id, socketId: port.id })),
  ]);
}

/** Enter on a node: its first port, if it has one. */
export function firstPortOf(diagram: ChainDiagram, nodeId: string): FocusTarget | null {
  const node = diagram.nodes.find((candidate) => candidate.id === nodeId);
  const port = node === undefined ? undefined : portsOf(node)[0];
  return port === undefined ? null : { nodeId, socketId: port.id };
}

// Up and down among the nodes of one column, which reading order already sorts.
function nodeInColumn(diagram: ChainDiagram, nodeId: string, step: 1 | -1): FocusTarget | null {
  const node = diagram.nodes.find((candidate) => candidate.id === nodeId);
  const column = diagram.nodes.filter((candidate) => candidate.column === node?.column);
  const at = column.findIndex((candidate) => candidate.id === nodeId);
  const next = at < 0 ? undefined : column[at + step];
  return next === undefined ? null : { nodeId: next.id, socketId: null };
}

// Along the chain: the first link leaving a node goes right, the one entering it goes left.
function nodeAlongChain(diagram: ChainDiagram, nodeId: string, direction: Direction) {
  const edge =
    direction === "right"
      ? diagram.edges.find((candidate) => candidate.fromNode === nodeId)
      : diagram.edges.find((candidate) => candidate.toNode === nodeId);
  const other = direction === "right" ? edge?.toNode : edge?.fromNode;
  return other === undefined ? null : { nodeId: other, socketId: null };
}

function portAlongLink(diagram: ChainDiagram, from: FocusTarget, direction: Direction) {
  const edge =
    direction === "right"
      ? diagram.edges.find((e) => e.fromNode === from.nodeId && e.fromSocket === from.socketId)
      : diagram.edges.find((e) => e.toNode === from.nodeId && e.toSocket === from.socketId);
  if (edge === undefined) {
    return null;
  }
  return direction === "right"
    ? { nodeId: edge.toNode, socketId: edge.toSocket }
    : { nodeId: edge.fromNode, socketId: edge.fromSocket };
}

// Up and down walk every focusable socket of the node in focus order (left side,
// then right), so that a drive's outputs stay reachable behind its command tags.
function portInNode(diagram: ChainDiagram, from: FocusTarget, step: 1 | -1) {
  const node = diagram.nodes.find((candidate) => candidate.id === from.nodeId);
  const sockets = node === undefined ? [] : portsOf(node);
  const at = sockets.findIndex((port) => port.id === from.socketId);
  const next = at < 0 ? undefined : sockets[at + step];
  return next === undefined ? null : { nodeId: from.nodeId, socketId: next.id };
}

/**
 * Where an arrow key leads from a focused node or port, or null to stay.
 * On a node: left and right follow the chain, up and down walk the column. On
 * a port: left and right cross the link, up and down walk the node's sockets.
 */
export function neighbour(
  diagram: ChainDiagram,
  from: FocusTarget,
  direction: Direction,
): FocusTarget | null {
  const vertical = direction === "up" || direction === "down";
  const step = direction === "down" ? 1 : -1;
  if (from.socketId === null) {
    return vertical
      ? nodeInColumn(diagram, from.nodeId, step)
      : nodeAlongChain(diagram, from.nodeId, direction);
  }
  return vertical ? portInNode(diagram, from, step) : portAlongLink(diagram, from, direction);
}

/** The link that ends at a port, the one Delete removes from a focused port. */
export function edgeInto(diagram: ChainDiagram, port: FocusTarget): DiagramEdge | null {
  return (
    diagram.edges.find((edge) => edge.toNode === port.nodeId && edge.toSocket === port.socketId) ??
    null
  );
}

/** The links that leave a port: a drive output or an anchor can have several. */
export function edgesFrom(diagram: ChainDiagram, port: FocusTarget): DiagramEdge[] {
  return diagram.edges.filter(
    (edge) => edge.fromNode === port.nodeId && edge.fromSocket === port.socketId,
  );
}
