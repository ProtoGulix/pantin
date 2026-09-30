import {
  edgeDragSource,
  isDragSource,
  type LinkTarget,
  linkTargets,
} from "../diagram/diagram-link-targets.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { Endpoint } from "../diagram/diagram-wiring.ts";
import type { DrawnDiagram } from "./diagram-draw.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { svgElement } from "./svg-dom.ts";

// Wiring with the pointer (ADR 0029 point 6): press on a link's source end and
// drag; what it can link to lights up and the rest steps back; letting go on a
// target sends the link. The judgement is the pure linkTargets/linkBetween; this
// only reads the pointer and marks elements.

type ShownModel = Extract<DiagramModel, { shown: true }>;

export interface DragContext {
  model(): ShownModel | null;
  drawn(): DrawnDiagram | null;
  intents(): PanelIntents | null;
}

// A press that moves less than this is a click, which selects.
const DRAG_THRESHOLD = 4;

function endpointOf(element: Element | null): Endpoint | null {
  const port = element?.closest("[data-socket-id]");
  const node = element?.closest("[data-node-id]");
  const nodeId = node?.getAttribute("data-node-id");
  return nodeId === null || nodeId === undefined
    ? null
    : { nodeId, socketId: port?.getAttribute("data-socket-id") ?? "" };
}

// Where a press can start a link: a source socket, or a sensor's wire.
function sourceAt(element: Element | null, model: ShownModel): Endpoint | null {
  const edgeId = element?.closest("[data-edge-id]")?.getAttribute("data-edge-id");
  if (edgeId !== null && edgeId !== undefined) {
    const edge = model.diagram.edges.find((candidate) => candidate.id === edgeId);
    return edge === undefined ? null : edgeDragSource(edge);
  }
  const endpoint = endpointOf(element);
  return endpoint !== null && isDragSource(endpoint) ? endpoint : null;
}

// A joint is a target as a whole node; any other target is one port.
function elementOf(drawn: DrawnDiagram, endpoint: Endpoint): Element | undefined {
  const node = drawn.nodes.get(endpoint.nodeId);
  return endpoint.nodeId.startsWith("joint:")
    ? node?.group
    : node?.sockets.get(endpoint.socketId)?.group;
}

function mark(drawn: DrawnDiagram, from: Endpoint, targets: readonly LinkTarget[]): () => void {
  const marked: Element[] = [];
  const add = (element: Element | undefined, className: string) => {
    if (element !== undefined) {
      element.classList.add(className);
      marked.push(element);
    }
  };
  drawn.svg.classList.add("diagram--linking");
  add(elementOf(drawn, from), "is-link-source");
  // The node the link leaves is not dimmed either.
  add(drawn.nodes.get(from.nodeId)?.group, "has-link-target");
  for (const { endpoint } of targets.filter(({ result }) => result.ok)) {
    add(elementOf(drawn, endpoint), "is-link-target");
    add(drawn.nodes.get(endpoint.nodeId)?.group, "has-link-target");
  }
  return () => {
    drawn.svg.classList.remove("diagram--linking");
    for (const element of marked) {
      element.classList.remove(
        "is-link-source",
        "is-link-target",
        "has-link-target",
        "is-link-hover",
      );
    }
  };
}

function sourcePoint(model: ShownModel, from: Endpoint) {
  const node = model.diagram.nodes.find((candidate) => candidate.id === from.nodeId);
  return node?.sockets.find((socket) => socket.id === from.socketId) ?? { x: 0, y: 0 };
}

// A press on a source that has not moved yet is only a candidate: a click.
interface Press {
  from: Endpoint;
  pointerId: number;
  x: number;
  y: number;
}

class LinkDrag {
  private press: Press | null = null;
  // Set once the pointer has moved: the preview line and what to unmark.
  private live: { preview: SVGElement; unmark: () => void } | null = null;
  private readonly context: DragContext;
  private readonly onEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // Other document-level listeners must not also act on this Escape.
      event.stopImmediatePropagation();
      this.end();
    }
  };

  constructor(context: DragContext) {
    this.context = context;
  }

  down(event: PointerEvent): void {
    const model = this.context.model();
    const target = event.target instanceof Element ? event.target : null;
    const from = event.button === 0 && model !== null ? sourceAt(target, model) : null;
    if (from !== null) {
      this.press = { from, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }

  move(event: PointerEvent, svg: SVGElement): void {
    const { press } = this;
    if (press?.pointerId !== event.pointerId) {
      return;
    }
    if (
      this.live === null &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >= DRAG_THRESHOLD
    ) {
      this.begin(press.from);
      // Captured: the rest of the gesture is ours, even outside the diagram.
      svg.setPointerCapture(event.pointerId);
    }
    this.follow(press.from, event);
  }

  up(event: PointerEvent): void {
    const { press } = this;
    if (press?.pointerId !== event.pointerId) {
      return;
    }
    const target = endpointOf(document.elementFromPoint(event.clientX, event.clientY));
    const dragged = this.live !== null;
    this.end();
    if (dragged && target !== null) {
      this.context.intents()?.linkDiagramNodes(press.from, target);
    }
  }

  end(): void {
    this.live?.preview.remove();
    this.live?.unmark();
    this.live = null;
    this.press = null;
    document.removeEventListener("keydown", this.onEscape);
  }

  private begin(from: Endpoint): void {
    const model = this.context.model();
    const drawn = this.context.drawn();
    if (model === null || drawn === null) {
      return;
    }
    const targets = linkTargets(model.document, model.diagram, from);
    const preview = svgElement("path", { class: "diagram-link-preview" });
    drawn.svg.append(preview);
    this.live = { preview, unmark: mark(drawn, from, targets) };
    document.addEventListener("keydown", this.onEscape);
  }

  private follow(from: Endpoint, event: PointerEvent): void {
    const model = this.context.model();
    const drawn = this.context.drawn();
    if (this.live === null || model === null || drawn === null) {
      return;
    }
    const box = drawn.svg.getBoundingClientRect();
    const start = sourcePoint(model, from);
    const line = `M${start.x} ${start.y} L${event.clientX - box.left} ${event.clientY - box.top}`;
    this.live.preview.setAttribute("d", line);
    for (const hovered of drawn.svg.querySelectorAll(".is-link-hover")) {
      hovered.classList.remove("is-link-hover");
    }
    const over = endpointOf(document.elementFromPoint(event.clientX, event.clientY));
    if (over !== null) {
      elementOf(drawn, over)?.classList.add("is-link-hover");
    }
  }
}

export function listenToLinkDrags(svg: SVGElement, context: DragContext): void {
  const drag = new LinkDrag(context);
  svg.addEventListener("pointerdown", (event) => drag.down(event));
  svg.addEventListener("pointermove", (event) => drag.move(event, svg));
  svg.addEventListener("pointerup", (event) => drag.up(event));
  svg.addEventListener("pointercancel", () => drag.end());
  // A redraw during a drag removes the svg: the capture is lost, nothing must stay listening.
  svg.addEventListener("lostpointercapture", () => drag.end());
}
