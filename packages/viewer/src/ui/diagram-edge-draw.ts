import { edgeLabelAnchor } from "../diagram/diagram-edge-label.ts";
import type { DiagramEdge } from "../diagram/diagram-types.ts";
import { svgElement } from "./svg-dom.ts";

// The wire of an edge as SVG. Its kind picks a colour and a line style in
// diagram.css (ADR 0029 point 5), so that colour is never the only cue. An
// edge carries the abbreviation of its kind as a second cue (ADR 0057); its end
// sockets name the ports (ADR 0030 point 5), and its accessible name names both ends.

export interface DrawnEdge {
  wire: SVGElement;
  // The abbreviation of the kind, drawn right after the wire (diagram.css fades them together).
  label: SVGElement;
  // A wide invisible path over the wire: the wire is too thin to click, and it
  // is what takes the focus and the selection of a link.
  hit: SVGElement;
}

export function drawEdge(edge: DiagramEdge, description: string, abbreviation: string): DrawnEdge {
  const path = edge.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const wire = svgElement("path", { class: `diagram-edge diagram-edge--${edge.kind}`, d: path }, [
    svgElement("title", {}, [description]),
  ]);
  const anchor = edgeLabelAnchor(edge.points);
  const label = svgElement("text", { class: "diagram-edge__label", x: anchor.x, y: anchor.y }, [
    abbreviation,
  ]);
  const hit = svgElement("path", {
    class: "diagram-edge__hit",
    d: path,
    role: "button",
    tabindex: -1,
    "aria-label": description,
    "data-edge-id": edge.id,
    "data-focus": `edge:${edge.id}`,
  });
  return { wire, label, hit };
}
