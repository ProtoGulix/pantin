import type { DiagramEdge } from "../diagram/diagram-types.ts";
import type { Translate } from "../i18n/translate.ts";
import type { DrawnDiagram } from "./diagram-draw.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { svgElement } from "./svg-dom.ts";

// A link clicked in the diagram is selected and offers a small × to remove it
// (ADR 0029 point 6); Delete does the same (diagram-keys.ts). A sensor's link
// cannot be removed, but the button stays to say why in its tooltip: the user
// who looks for it learns to drag the link onto another joint instead.

const BUTTON_RADIUS = 8;

// Half way along the wire: the middle of the slant, or of the straight line.
function middleOf(edge: DiagramEdge): { x: number; y: number } {
  const points = edge.points;
  const [a, b] =
    points.length === 4 ? [points[1], points[2]] : [points[0], points[points.length - 1]];
  return { x: ((a?.x ?? 0) + (b?.x ?? 0)) / 2, y: ((a?.y ?? 0) + (b?.y ?? 0)) / 2 };
}

export class EdgeSelection {
  private selectedId: string | null = null;
  private removeButton: SVGElement | null = null;

  get id(): string | null {
    return this.selectedId;
  }

  /** Selects a link (or none), drawing its × button over the diagram. */
  select(
    drawn: DrawnDiagram,
    edges: readonly DiagramEdge[],
    edgeId: string | null,
    t: Translate,
    intents: PanelIntents,
  ): void {
    this.removeButton?.remove();
    this.removeButton = null;
    drawn.edges.get(this.selectedId ?? "")?.classList.remove("is-selected");
    const edge = edges.find((candidate) => candidate.id === edgeId);
    this.selectedId = edge?.id ?? null;
    if (edge === undefined) {
      return;
    }
    drawn.edges.get(edge.id)?.classList.add("is-selected");
    const at = middleOf(edge);
    const keeps = edge.kind === "observation";
    const label = t(keeps ? "diagram.edge.removeSensor" : "diagram.edge.remove");
    const removeButton = svgElement(
      "g",
      {
        class: `diagram-edge-remove${keeps ? " is-disabled" : ""}`,
        role: "button",
        tabindex: -1,
        "aria-label": label,
        "aria-disabled": String(keeps),
        transform: `translate(${at.x} ${at.y})`,
      },
      [
        svgElement("title", {}, [label]),
        svgElement("circle", { r: BUTTON_RADIUS }),
        svgElement("path", { d: "M-3 -3L3 3M3 -3L-3 3" }),
      ],
    );
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      intents.removeDiagramLink(edge.fromNode, edge.toNode);
    });
    drawn.svg.append(removeButton);
    this.removeButton = removeButton;
  }

  /** A redraw made new elements: keep the selection if the link is still there. */
  reapply(
    drawn: DrawnDiagram,
    edges: readonly DiagramEdge[],
    t: Translate,
    intents: PanelIntents,
  ): void {
    this.removeButton = null;
    const kept = edges.some((edge) => edge.id === this.selectedId) ? this.selectedId : null;
    this.selectedId = null;
    this.select(drawn, edges, kept, t, intents);
  }
}
