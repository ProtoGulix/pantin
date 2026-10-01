import { COLUMN_GAP } from "./diagram-constants.ts";
import type { ForestNode } from "./diagram-forest.ts";
import type { DiagramEdge, DiagramNode, DiagramPoint, EdgeKind, Socket } from "./diagram-types.ts";

// Edges between a node and its children (ADR 0029 point 5). Always from one
// column to the next. A crossing, such as a swapped feed, shows as a crossing.

// Length of the horizontal stub at each end of a wire; under half the gap, so
// that the two stubs of a wire never meet.
const STUB_LENGTH = COLUMN_GAP / 4;

interface Link {
  kind: EdgeKind;
  from: DiagramNode;
  fromSocket: Socket;
  to: DiagramNode;
  toSocket: Socket;
}

function socketOf(node: DiagramNode, socketId: string): Socket | undefined {
  return node.sockets.find((socket) => socket.id === socketId);
}

// One link per input port of the actuator, from the drive port it reads. A
// feed naming a port the types do not declare is skipped: the core refuses it,
// the diagram has nothing to attach it to.
function feedLinks(
  parent: DiagramNode,
  child: DiagramNode,
  feed: Readonly<Record<string, string>>,
): Link[] {
  const links: Link[] = [];
  for (const input of child.sockets.filter((socket) => socket.role === "input")) {
    const output = socketOf(parent, `out:${feed[input.id.slice("in:".length)]}`);
    if (output?.domain !== undefined) {
      links.push({
        kind: output.domain,
        from: parent,
        fromSocket: output,
        to: child,
        toSocket: input,
      });
    }
  }
  return links;
}

function anchorLinks(parent: DiagramNode, child: DiagramNode): Link[] {
  const fromSocket = socketOf(parent, "out");
  const toSocket = socketOf(child, "in");
  if (fromSocket === undefined || toSocket === undefined) {
    return [];
  }
  const kind = child.kind === "sensor" ? "observation" : "mechanical";
  return [{ kind, from: parent, fromSocket, to: child, toSocket }];
}

// A wire leaves and enters its socket horizontally for a short stub, and
// crosses the gap on a slant. With right angles, two wires that swap the same
// two heights (a swapped feed) must share a horizontal stretch whatever their
// bends, which hides the very wiring the diagram is there to show; slants
// cross in an X instead. Wires of different sockets never lie on one another:
// their slants span the same abscissas, so they would need the same source and
// target heights, that is the same socket; stubs are shorter than half the gap.
function pathOf(link: Link): DiagramPoint[] {
  const start = { x: link.fromSocket.x, y: link.fromSocket.y };
  const end = { x: link.toSocket.x, y: link.toSocket.y };
  if (start.y === end.y) {
    return [start, end];
  }
  return [
    start,
    { x: start.x + STUB_LENGTH, y: start.y },
    { x: end.x - STUB_LENGTH, y: end.y },
    end,
  ];
}

function routeLinks(links: readonly Link[]): DiagramEdge[] {
  return links.map((link) => ({
    id: `${link.from.id}/${link.fromSocket.id}>${link.to.id}/${link.toSocket.id}`,
    kind: link.kind,
    fromNode: link.from.id,
    fromSocket: link.fromSocket.id,
    toNode: link.to.id,
    toSocket: link.toSocket.id,
    points: pathOf(link),
  }));
}

/** The edges of the placed nodes of a band, parent by parent in tree order. */
export function edgesOf(
  roots: readonly ForestNode[],
  placed: ReadonlyMap<string, DiagramNode>,
): DiagramEdge[] {
  const edges: DiagramEdge[] = [];
  const visit = (node: ForestNode): void => {
    const parent = placed.get(node.id);
    const links: Link[] = [];
    for (const childForest of node.children) {
      const child = placed.get(childForest.id);
      if (parent !== undefined && child !== undefined) {
        links.push(
          ...(node.kind === "drive"
            ? feedLinks(parent, child, childForest.feedPorts)
            : anchorLinks(parent, child)),
        );
      }
      visit(childForest);
    }
    edges.push(...routeLinks(links));
  };
  roots.forEach(visit);
  return edges;
}
