import { NODE_TITLE_HEIGHT, NODE_WIDTH } from "../diagram/diagram-constants.ts";
import { truncateLabel } from "../diagram/diagram-texts.ts";
import type { DiagramNode, Socket } from "../diagram/diagram-types.ts";
import type { Translate } from "../i18n/translate.ts";
import { svgElement } from "./svg-dom.ts";

// One node of the chain diagram as SVG: a rounded box, its label and type, the
// sockets with their names, and the badge of a foreign assembly. The live
// parts (lit sockets, warning) are changed later by the view, in place.

const PADDING = 8;
const SOCKET_RADIUS = 4;
const BADGE_HEIGHT = 13;
const BADGE_CHARACTER_LIMIT = 16;
// Baseline of a warning under the box, in the gap before the next row.
const WARNING_RISE = 10;

export interface DrawnNode {
  group: SVGElement;
  box: SVGElement;
  // The tooltip, which says the warning too while there is one.
  title: SVGElement;
  // Where a warning is written, under the box; null while there is none.
  warning: SVGElement | null;
  warningAnchor: { x: number; y: number };
  // The aria-label and tooltip without a warning; the warning is appended to them.
  baseLabel: string;
  sockets: ReadonlyMap<string, SVGElement>;
}

function text(className: string, x: number, y: number, content: string): SVGElement {
  return svgElement("text", { class: className, x, y }, [content]);
}

interface DrawnSocket {
  circle: SVGElement;
  label: SVGElement | null;
}

function drawSocket(socket: Socket): DrawnSocket {
  const circle = svgElement("circle", {
    class: `diagram-socket diagram-socket--${socket.role}`,
    cx: socket.x,
    cy: socket.y,
    r: SOCKET_RADIUS,
  });
  if (socket.label === "") {
    return { circle, label: null };
  }
  const left = socket.side === "left";
  const label = text(
    `diagram-socket__label${left ? "" : " diagram-socket__label--right"}`,
    socket.x + (left ? PADDING : -PADDING),
    socket.y + 3.5,
    socket.label,
  );
  return { circle, label };
}

function badgeParts(node: DiagramNode, t: Translate): SVGElement[] {
  if (node.foreignAssembly === undefined) {
    return [];
  }
  const name = truncateLabel(node.foreignAssembly.name, BADGE_CHARACTER_LIMIT * 6.2);
  const width = Math.min(NODE_WIDTH - 2 * PADDING, [...name].length * 5.4 + 10);
  const x = node.x + node.width - PADDING - width;
  const y = node.y - BADGE_HEIGHT / 2;
  return [
    svgElement("g", { class: "diagram-badge" }, [
      svgElement("title", {}, [t("diagram.foreignAssembly", { name: node.foreignAssembly.name })]),
      svgElement("rect", { x, y, width, height: BADGE_HEIGHT, rx: BADGE_HEIGHT / 2 }),
      text("diagram-badge__text", x + width / 2, y + 9.5, name),
    ]),
  ];
}

function accessibleLabel(node: DiagramNode, typeLabel: string, t: Translate): string {
  const parameters = { kind: t(`diagram.kind.${node.kind}`), name: node.label, type: typeLabel };
  return node.foreignAssembly === undefined
    ? t("diagram.node", parameters)
    : t("diagram.nodeWithAssembly", { ...parameters, assembly: node.foreignAssembly.name });
}

function titleParts(node: DiagramNode, typeLabel: string): SVGElement[] {
  const innerWidth = node.width - 2 * PADDING;
  return [
    text(
      "diagram-node__title",
      node.x + PADDING,
      node.y + NODE_TITLE_HEIGHT / 2,
      truncateLabel(node.label, innerWidth),
    ),
    text(
      "diagram-node__type",
      node.x + PADDING,
      node.y + NODE_TITLE_HEIGHT - 3,
      truncateLabel(typeLabel, innerWidth),
    ),
  ];
}

export function drawNode(node: DiagramNode, typeLabel: string, t: Translate): DrawnNode {
  const baseLabel = accessibleLabel(node, typeLabel, t);
  const box = svgElement("rect", {
    class: "diagram-node__box",
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rx: 6,
  });
  const drawnSockets = node.sockets.map((socket) => [socket.id, drawSocket(socket)] as const);
  const socketParts = drawnSockets.flatMap(([, drawn]) =>
    drawn.label === null ? [drawn.circle] : [drawn.circle, drawn.label],
  );
  const attributes = {
    class: `diagram-node diagram-node--${node.kind}`,
    role: "group",
    "aria-label": baseLabel,
    "data-node-id": node.id,
  };
  // The full label is in the tooltip, where the box shows it cut to fit.
  const title = svgElement("title", {}, [baseLabel]);
  const group = svgElement("g", attributes, [
    title,
    box,
    ...titleParts(node, typeLabel),
    ...socketParts,
    ...badgeParts(node, t),
  ]);
  const sockets = new Map(drawnSockets.map(([id, drawn]) => [id, drawn.circle]));
  const warningAnchor = { x: node.x + 2, y: node.y + node.height + WARNING_RISE };
  return { group, box, title, warning: null, warningAnchor, baseLabel, sockets };
}
