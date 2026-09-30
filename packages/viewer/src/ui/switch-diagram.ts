import type { SwitchDiagramModel } from "../sensors/switch-diagram-model.ts";
import { element } from "./dom.ts";

// Draws a switch diagram model (ADR 0026) as inline SVG. Colours are the
// viewer's CSS tokens, set in switch-diagram.css through classes, so the diagram
// follows the theme. No layout decision is taken here.

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const BAR_HEIGHT = 12;
const ARROW = 4;
const SYMBOL_HEIGHT = 22;

function svgElement(
  tag: string,
  attributes: Readonly<Record<string, string | number>>,
  text?: string,
): SVGElement {
  const created = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) {
    created.setAttribute(name, String(value));
  }
  if (text !== undefined) {
    created.textContent = text;
  }
  return created;
}

const polygon = (className: string, points: readonly (readonly [number, number])[]) =>
  svgElement("polygon", { class: className, points: points.map((p) => p.join(",")).join(" ") });

const rect = (className: string, x1: number, x2: number, y: number, height: number) =>
  svgElement("rect", { class: className, x: x1, y, width: Math.max(x2 - x1, 0), height });

// A triangle at the end of a line, pointing left (-1) or right (+1).
function arrowHead(className: string, x: number, y: number, direction: -1 | 1) {
  return polygon(className, [
    [x, y],
    [x - direction * ARROW * 1.5, y - ARROW / 1.5],
    [x - direction * ARROW * 1.5, y + ARROW / 1.5],
  ]);
}

function zones(model: SwitchDiagramModel): SVGElement[] {
  const { bar } = model;
  const drawn = [
    { band: model.hold, className: "switch-diagram__hold" },
    { band: model.on, className: "switch-diagram__on" },
  ];
  return drawn
    .flatMap(({ band, className }) => [
      rect(className, band.x1, band.x2, bar.y, BAR_HEIGHT),
      band.openLow
        ? arrowHead("switch-diagram__zone-arrow", band.x1, bar.y + BAR_HEIGHT / 2, -1)
        : null,
      band.openHigh
        ? arrowHead("switch-diagram__zone-arrow", band.x2, bar.y + BAR_HEIGHT / 2, 1)
        : null,
    ])
    .filter((node): node is SVGElement => node !== null);
}

interface SymbolGeometry {
  x: number;
  top: number;
  tip: number;
  // +1 when the sensor looks towards increasing coordinates, else -1.
  side: number;
}

const line = (x1: number, y1: number, x2: number, y2: number) =>
  svgElement("line", { x1, y1, x2, y2 });

const SYMBOL_SHAPES: Readonly<Record<string, (g: SymbolGeometry) => SVGElement[]>> = {
  plunger: ({ x, top, tip }) => [
    line(x, top, x, tip),
    polygon("", [
      [x - 3, tip - 6],
      [x + 3, tip - 6],
      [x, tip],
    ]),
  ],
  face: ({ x, top, tip, side }) => [
    line(x, top, x, tip),
    line(x, top, x - side * 6, top),
    polygon("", [
      [x, tip - 2],
      [x + side * 6, tip - 7],
      [x + side * 6, tip + 3],
    ]),
  ],
  slot: ({ x, top, tip }) => [
    svgElement("path", { d: `M${x - 7},${top} V${tip} H${x + 7} V${top}` }),
  ],
  range: ({ x, top, tip }) => [
    line(x, top, x, tip),
    line(x - 5, top, x + 5, top),
    line(x - 5, tip, x + 5, tip),
  ],
};

// A sensor is drawn above the bar, its tip on the bar, looking along `facing`.
function symbol(model: SwitchDiagramModel): SVGElement {
  const { kind, x, facing, refused } = model.symbol;
  const className = refused
    ? "switch-diagram__symbol switch-diagram__symbol--refused"
    : "switch-diagram__symbol";
  const geometry = {
    x,
    top: model.bar.y - SYMBOL_HEIGHT,
    tip: model.bar.y,
    side: facing === "increasing" ? 1 : -1,
  };
  const group = svgElement("g", { class: className });
  group.append(...(SYMBOL_SHAPES[kind]?.(geometry) ?? []));
  return group;
}

function dimensions(model: SwitchDiagramModel): SVGElement[] {
  const base = model.bar.y + BAR_HEIGHT;
  return model.dimensions.flatMap(({ x1, x2, y, text, textX }) => [
    svgElement("line", { class: "switch-diagram__extension", x1, y1: base, x2: x1, y2: y }),
    svgElement("line", { class: "switch-diagram__extension", x1: x2, y1: base, x2, y2: y }),
    svgElement("line", { class: "switch-diagram__dimension", x1, y1: y, x2, y2: y }),
    arrowHead("switch-diagram__arrow", x1, y, 1),
    arrowHead("switch-diagram__arrow", x2, y, -1),
    svgElement(
      "text",
      { class: "switch-diagram__text", x: textX, y: y - 3, "text-anchor": "middle" },
      text,
    ),
  ]);
}

export function renderSwitchDiagram(model: SwitchDiagramModel): HTMLElement {
  const svg = svgElement("svg", {
    class: "switch-diagram__svg",
    viewBox: `0 0 ${model.width} ${model.height}`,
    role: "img",
    "aria-label": model.dimensions.map(({ text }) => text).join(", "),
  });
  svg.append(
    rect("switch-diagram__bar", model.bar.x1, model.bar.x2, model.bar.y, BAR_HEIGHT),
    ...zones(model),
    symbol(model),
    ...dimensions(model),
  );
  return element("div", { className: "switch-diagram" }, [
    svg,
    model.problem === null
      ? null
      : element("p", {
          className: "switch-diagram__problem",
          text: model.problem,
          attributes: { role: "alert" },
        }),
  ]);
}
