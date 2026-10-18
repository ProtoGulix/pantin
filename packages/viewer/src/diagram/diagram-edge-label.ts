import type { DiagramPoint } from "./diagram-types.ts";

// Where the abbreviation of a wire's kind is written (ADR 0057): on the wire,
// a third of the way along, which on a slanted wire lies before the middle
// where the remove button of a selected link appears.

const LABEL_POSITION = 0.35;
// Lifts the baseline of the text above the wire, in diagram units.
const LABEL_LIFT = 4;

function segmentLength(from: DiagramPoint, to: DiagramPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** The anchor (middle of the text, baseline) of a wire's label, on its polyline. */
export function edgeLabelAnchor(points: readonly DiagramPoint[]): DiagramPoint {
  const first = points[0];
  if (first === undefined) {
    return { x: 0, y: 0 };
  }
  const total = points
    .slice(1)
    .reduce((sum, to, i) => sum + segmentLength(points[i] ?? first, to), 0);
  let remaining = total * LABEL_POSITION;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1] ?? first;
    const to = points[i] ?? first;
    const length = segmentLength(from, to);
    if (remaining <= length && length > 0) {
      const share = remaining / length;
      return {
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share - LABEL_LIFT,
      };
    }
    remaining -= length;
  }
  return { x: first.x, y: first.y - LABEL_LIFT };
}
