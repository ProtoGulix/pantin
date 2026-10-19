import type { StarHighlight } from "../joint-star/joint-star-highlight.ts";
import type { DrawnStar } from "./joint-star-draw.ts";

// Applies the selection to a drawn joint tree in place, without redrawing it (ADR 0059
// point 6). Classes carry the selection; the stylesheet turns them into a blue outline
// and a thicker line, and the selected node also gets aria-current.

export function paintHighlight(drawn: DrawnStar, next: StarHighlight): void {
  for (const [id, node] of drawn.nodes) {
    const selected = next.selectedNodeIds.has(id);
    node.group.classList.toggle("is-selected", selected);
    node.group.classList.toggle("is-on-path", next.pathNodeIds.has(id));
    if (selected) {
      node.group.setAttribute("aria-current", "true");
    } else {
      node.group.removeAttribute("aria-current");
    }
    // The selected node shows its whole name on a halo above the next columns; the others are cut short.
    const onTop = selected && node.fullLabelOnTop !== null;
    node.label.classList.toggle("is-replaced", onTop);
    node.fullLabelOnTop?.classList.toggle("is-shown", onTop);
  }
  for (const [id, edge] of drawn.edges) {
    edge.group.classList.toggle("is-selected", next.selectedEdgeIds.has(id));
    edge.group.classList.toggle("is-on-path", next.pathEdgeIds.has(id));
  }
  // World alone (the Pantin row) has no path: nothing to step back from.
  const anything = next.pathNodeIds.size + next.pathEdgeIds.size > 0;
  drawn.svg.classList.toggle("joint-star__svg--focus", anything);
}
