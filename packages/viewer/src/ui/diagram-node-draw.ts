import { NODE_TITLE_HEIGHT, NODE_WIDTH } from "../diagram/diagram-constants.ts";
import { focusKeyOf } from "../diagram/diagram-focus.ts";
import { commandSocketName } from "../diagram/diagram-forcing.ts";
import { portLabel, truncateLabel } from "../diagram/diagram-texts.ts";
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
  sockets: ReadonlyMap<string, DrawnPort>;
}

// A socket as a group: the dot, its name, and a larger invisible area to
// aim at when dragging a link or pressing a command. A port or a command tag
// takes the keyboard focus; a sensor's tag only shows a value.
interface DrawnPort {
  group: SVGElement;
  // The accessible name without the lit state (or the value), which the view appends.
  baseLabel: string;
  // What a press does to a command tag; null for a port and a read only tag.
  forcing: "toggle" | "edit" | null;
}

function text(className: string, x: number, y: number, content: string): SVGElement {
  return svgElement("text", { class: className, x, y }, [content]);
}

const HIT_HEIGHT = 18;
const ANCHOR_HIT_RADIUS = 10;

// The area to aim at: the socket's row up to mid-node, or round an anchor.
function hitArea(node: DiagramNode, socket: Socket): SVGElement {
  if (socket.label === "") {
    return svgElement("circle", {
      class: "diagram-port__hit",
      cx: socket.x,
      cy: socket.y,
      r: ANCHOR_HIT_RADIUS,
    });
  }
  const half = node.width / 2;
  return svgElement("rect", {
    class: "diagram-port__hit",
    x: socket.side === "left" ? node.x : node.x + half,
    y: socket.y - HIT_HEIGHT / 2,
    width: half,
    height: HIT_HEIGHT,
  });
}

type Forcing = DrawnPort["forcing"];

function forcingOf(socket: Socket): Forcing {
  if (socket.role !== "command") {
    return null;
  }
  return socket.tagType === "bit" ? "toggle" : "edit";
}

function socketLabel(socket: Socket, t: Translate, node: DiagramNode): string {
  if (socket.role === "feedback") {
    return "";
  }
  return socket.role === "command" ? commandSocketName(socket, t) : portLabel(node, socket, t);
}

function focusAttributes(node: DiagramNode, socket: Socket, label: string, forcing: Forcing) {
  return {
    class: `diagram-port diagram-port--${socket.role}`,
    role: "button",
    tabindex: -1,
    "aria-label": label,
    "data-focus": focusKeyOf({ nodeId: node.id, socketId: socket.id }),
    "data-node-id": node.id,
    "data-socket-id": socket.id,
    ...(forcing === "toggle" ? { "aria-pressed": "false" } : {}),
    ...(forcing === null ? {} : { "data-forcing": forcing }),
  };
}

function drawSocket(node: DiagramNode, socket: Socket, t: Translate): DrawnPort {
  const dot = svgElement("circle", {
    class: `diagram-socket diagram-socket--${socket.role}`,
    cx: socket.x,
    cy: socket.y,
    r: SOCKET_RADIUS,
  });
  const left = socket.side === "left";
  const label =
    socket.label === ""
      ? []
      : [
          text(
            `diagram-socket__label${left ? "" : " diagram-socket__label--right"}`,
            socket.x + (left ? PADDING : -PADDING),
            socket.y + 3.5,
            socket.label,
          ),
        ];
  const forcing = forcingOf(socket);
  const baseLabel = socketLabel(socket, t, node);
  if (socket.role === "feedback") {
    const attributes = { class: "diagram-port", "aria-hidden": "true" };
    return { group: svgElement("g", attributes, [dot, ...label]), baseLabel, forcing };
  }
  const attributes = focusAttributes(node, socket, baseLabel, forcing);
  const group = svgElement("g", attributes, [hitArea(node, socket), dot, ...label]);
  return { group, baseLabel, forcing };
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
  const drawnSockets = node.sockets.map(
    (socket) => [socket.id, drawSocket(node, socket, t)] as const,
  );
  const socketParts = drawnSockets.map(([, drawn]) => drawn.group);
  const attributes = {
    class: `diagram-node diagram-node--${node.kind}`,
    role: "group",
    "aria-roledescription": t("diagram.node.role"),
    tabindex: -1,
    "aria-label": baseLabel,
    "data-node-id": node.id,
    "data-focus": focusKeyOf({ nodeId: node.id, socketId: null }),
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
  const sockets = new Map(drawnSockets);
  const warningAnchor = { x: node.x + 2, y: node.y + node.height + WARNING_RISE };
  return { group, box, title, warning: null, warningAnchor, baseLabel, sockets };
}
