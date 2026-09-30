import type { DiagramEdge } from "../diagram/diagram-types.ts";
import type { Translate } from "../i18n/translate.ts";
import { svgElement } from "./svg-dom.ts";

// The wire of an edge as SVG. Its kind picks a colour and a line style in
// diagram.css (ADR 0029 point 5), so that colour is never the only cue. The
// port label sits just left of the target socket, with a halo in the page
// colour so that a slant passing under it does not make it unreadable.

export interface DrawnEdge {
  wire: SVGElement;
  label: SVGElement | null;
}

const LABEL_GAP = 7;
const LABEL_RISE = 4;

export function drawEdge(edge: DiagramEdge, t: Translate): DrawnEdge {
  const path = edge.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const kindText = t(`diagram.edge.${edge.kind}`);
  const description = edge.label === undefined ? kindText : `${kindText}: ${edge.label}`;
  const wire = svgElement("path", { class: `diagram-edge diagram-edge--${edge.kind}`, d: path }, [
    svgElement("title", {}, [description]),
  ]);
  const anchor = edge.labelAnchor;
  const label =
    edge.label === undefined || anchor === undefined
      ? null
      : svgElement(
          "text",
          {
            class: "diagram-edge__label",
            x: anchor.x - LABEL_GAP,
            y: anchor.y - LABEL_RISE,
            "aria-hidden": "true",
          },
          [edge.label],
        );
  return { wire, label };
}
