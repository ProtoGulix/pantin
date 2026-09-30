import type { ChainDiagram, DiagramEdge, DiagramPoint } from "./diagram-types.ts";

// Geometry checks for the layout tests: whether nodes overlap and whether
// edge paths meet or run along one another.

function orientation(a: DiagramPoint, b: DiagramPoint, c: DiagramPoint): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function onSegment(a: DiagramPoint, b: DiagramPoint, point: DiagramPoint): boolean {
  return (
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}

// Touching counts as meeting: two edges of different nodes must stay apart.
function segmentsMeet(a: DiagramPoint, b: DiagramPoint, c: DiagramPoint, d: DiagramPoint) {
  const [o1, o2, o3, o4] = [
    orientation(a, b, c),
    orientation(a, b, d),
    orientation(c, d, a),
    orientation(c, d, b),
  ];
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  return (
    (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b))
  );
}

export function pathsMeet(first: DiagramEdge, second: DiagramEdge): boolean {
  for (let i = 0; i + 1 < first.points.length; i++) {
    for (let j = 0; j + 1 < second.points.length; j++) {
      const [a, b, c, d] = [
        first.points[i],
        first.points[i + 1],
        second.points[j],
        second.points[j + 1],
      ];
      if (a && b && c && d && segmentsMeet(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

export function overlapping(diagram: ChainDiagram): string[] {
  const found: string[] = [];
  diagram.nodes.forEach((first, index) => {
    for (const second of diagram.nodes.slice(index + 1)) {
      const apart =
        first.x + first.width <= second.x ||
        second.x + second.width <= first.x ||
        first.y + first.height <= second.y ||
        second.y + second.height <= first.y;
      if (!apart) {
        found.push(`${first.id} / ${second.id}`);
      }
    }
  });
  return found;
}

function overlapLength(a1: number, a2: number, b1: number, b2: number): number {
  return (
    Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2))
  );
}

// Two horizontal or vertical segments lying on one line and covering a common
// stretch (a single shared point is not a shared segment). Slants need no
// check: all slants of one gap span the same abscissas, so two of them could
// only coincide with the same source and target heights, that is one socket.
function segmentsShare(a: DiagramPoint, b: DiagramPoint, c: DiagramPoint, d: DiagramPoint) {
  if (a.y === b.y && c.y === d.y) {
    return a.y === c.y && overlapLength(a.x, b.x, c.x, d.x) > 0;
  }
  if (a.x === b.x && c.x === d.x) {
    return a.x === c.x && overlapLength(a.y, b.y, c.y, d.y) > 0;
  }
  return false;
}

export function pathsShareSegment(first: DiagramEdge, second: DiagramEdge): boolean {
  for (let i = 0; i + 1 < first.points.length; i++) {
    for (let j = 0; j + 1 < second.points.length; j++) {
      const [a, b, c, d] = [
        first.points[i],
        first.points[i + 1],
        second.points[j],
        second.points[j + 1],
      ];
      if (a && b && c && d && segmentsShare(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

/** Every pair of distinct edges of the diagram that satisfy `test`, as "id x id". */
export function edgePairs(
  diagram: ChainDiagram,
  test: (first: DiagramEdge, second: DiagramEdge) => boolean,
): string[] {
  const found: string[] = [];
  diagram.edges.forEach((first, index) => {
    for (const second of diagram.edges.slice(index + 1)) {
      if (test(first, second)) {
        found.push(`${first.id} x ${second.id}`);
      }
    }
  });
  return found;
}
