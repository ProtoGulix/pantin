import { edgeDescription } from "../diagram/diagram-texts.ts";
import type { DiagramBand } from "../diagram/diagram-types.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { Translate } from "../i18n/translate.ts";
import { drawEdge } from "./diagram-edge-draw.ts";
import { type DrawnNode, drawNode } from "./diagram-node-draw.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { svgElement } from "./svg-dom.ts";

// The whole diagram as one SVG, drawn once per layout. Live state and
// selection are applied later to the elements kept in DrawnDiagram.

type ShownModel = Extract<DiagramModel, { shown: true }>;

export interface DrawnDiagram {
  svg: SVGElement;
  nodes: ReadonlyMap<string, DrawnNode>;
  edges: ReadonlyMap<string, SVGElement>;
  // Everything that takes the keyboard focus, by its key ("band:", "node:",
  // "port:", "edge:"), so that the focus survives a redraw without selectors.
  focusables: ReadonlyMap<string, SVGElement>;
}

export const HELP_ID = "diagram-help";
const HEADER_HEIGHT = 28;
const BAND_INSET = 8;

// A chevron pointing right when folded, down when open, like the tree's.
const CHEVRON_FOLDED = "M11 9l5 5-5 5";
const CHEVRON_OPEN = "M9 11l5 5 5-5";

function drawBand(
  band: DiagramBand,
  width: number,
  t: Translate,
  intents: PanelIntents,
): SVGElement {
  const label = t(band.collapsed ? "diagram.band.expand" : "diagram.band.collapse", {
    name: band.name,
  });
  const toggle = svgElement(
    "g",
    {
      class: "diagram-band__toggle",
      role: "button",
      tabindex: 0,
      "aria-expanded": String(!band.collapsed),
      "aria-label": label,
      "data-focus": `band:${band.key}`,
      transform: `translate(${BAND_INSET} ${band.y})`,
    },
    [
      svgElement("title", {}, [label]),
      svgElement("rect", { width: HEADER_HEIGHT * 5, height: HEADER_HEIGHT, fill: "transparent" }),
      svgElement("path", {
        class: "diagram-band__chevron",
        d: band.collapsed ? CHEVRON_FOLDED : CHEVRON_OPEN,
      }),
      svgElement("text", { class: "diagram-band__name", x: 30, y: 19 }, [band.name]),
    ],
  );
  const activate = () => intents.toggleDiagramBand(band.key);
  toggle.addEventListener("click", activate);
  toggle.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
  return svgElement("g", { class: "diagram-band", "data-band": band.key }, [
    svgElement("rect", {
      class: "diagram-band__background",
      x: BAND_INSET,
      y: band.y,
      width: width - 2 * BAND_INSET,
      height: band.height,
      rx: 6,
    }),
    toggle,
  ]);
}

// Read back from the drawing, which is the one place that says what is focusable.
function focusablesOf(svg: SVGElement): Map<string, SVGElement> {
  const found = new Map<string, SVGElement>();
  for (const item of svg.querySelectorAll("[data-focus]")) {
    const key = item.getAttribute("data-focus");
    if (key !== null && item instanceof SVGElement) {
      found.set(key, item);
    }
  }
  return found;
}

export function drawDiagram(model: ShownModel, intents: PanelIntents): DrawnDiagram {
  const { diagram, typeLabels, translate: t } = model;
  const drawnNodes = new Map(
    diagram.nodes.map((node) => [node.id, drawNode(node, typeLabels.get(node.id) ?? "", t)]),
  );
  for (const [nodeId, drawn] of drawnNodes) {
    drawn.group.addEventListener("click", () => intents.selectDiagramNode(nodeId));
  }
  const drawnEdges = diagram.edges.map(
    (edge) => [edge.id, drawEdge(edge, edgeDescription(diagram, edge, t))] as const,
  );
  const svg = svgElement(
    "svg",
    {
      class: "diagram__svg",
      // The diagram has its own keys (arrows, Enter): an application, described by the help text.
      role: "application",
      "aria-roledescription": t("diagram.roleDescription"),
      "aria-describedby": HELP_ID,
      "aria-label": t("diagram.label"),
      width: diagram.width,
      height: diagram.height,
      viewBox: `0 0 ${diagram.width} ${diagram.height}`,
    },
    [
      ...diagram.bands.map((band) => drawBand(band, diagram.width, t, intents)),
      // Wires under the nodes.
      ...drawnEdges.map(([, drawn]) => drawn.wire),
      ...drawnEdges.map(([, drawn]) => drawn.hit),
      ...[...drawnNodes.values()].map((drawn) => drawn.group),
    ],
  );
  return {
    svg,
    nodes: drawnNodes,
    edges: new Map(drawnEdges.map(([id, drawn]) => [id, drawn.wire])),
    focusables: focusablesOf(svg),
  };
}
