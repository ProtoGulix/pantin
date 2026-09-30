import type { DriveRuntime } from "@pantin/protocol";
import {
  changedDiagnostics,
  diffSets,
  type LiveState,
  liveStateOf,
  NO_LIVE_STATE,
  type SetChanges,
} from "../diagram/diagram-live.ts";
import { type NodeHighlight, relatedEdgeIds } from "../diagram/diagram-selection.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { Translate } from "../i18n/translate.ts";
import { type DrawnDiagram, drawDiagram } from "./diagram-draw.ts";
import { showNodeWarning } from "./diagram-warning.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The chain diagram in the central area (ADR 0029). It is redrawn when the
// layout changes; selection and live state are applied in place and only to
// the elements that changed, because tags are read four times a second.

type ShownModel = Extract<DiagramModel, { shown: true }>;

const SHOWN_CLASS = "viewport--diagram";

function setClass(target: Element | undefined, name: string, on: boolean): void {
  target?.classList.toggle(name, on);
}

// Switches a class on for what was added and off for what was removed.
function applyChanges(
  changes: SetChanges,
  find: (id: string) => Element | undefined,
  className: string,
): void {
  for (const id of changes.added) {
    setClass(find(id), className, true);
  }
  for (const id of changes.removed) {
    setClass(find(id), className, false);
  }
}

// A socket key is "<node id>|<socket id>".
function socketOf(drawn: DrawnDiagram, key: string): Element | undefined {
  const [nodeId = "", socketId = ""] = key.split("|");
  return drawn.nodes.get(nodeId)?.sockets.get(socketId);
}

export class DiagramView {
  private readonly host = element("div", { className: "diagram" });
  private readonly emptyText = element("p", { className: "diagram__empty" });
  private readonly viewport: HTMLElement;
  private model: ShownModel | null = null;
  private drawn: DrawnDiagram | null = null;
  private highlight: ReadonlyMap<string, NodeHighlight> = new Map();
  private live: LiveState = NO_LIVE_STATE;

  // The diagram goes under `before` (the welcome overlay), over the canvas.
  constructor(viewport: HTMLElement, before: HTMLElement) {
    this.viewport = viewport;
    this.host.hidden = true;
    viewport.insertBefore(this.host, before);
  }

  render(model: DiagramModel, intents: PanelIntents): void {
    this.viewport.classList.toggle(SHOWN_CLASS, model.shown);
    this.host.hidden = !model.shown;
    if (!model.shown) {
      return;
    }
    // The builder hands the same diagram object while nothing changed the layout.
    const redraw = this.model?.diagram !== model.diagram;
    this.model = model;
    if (redraw) {
      const focusedBand = this.focusedBandKey();
      this.redraw(model, intents);
      this.restoreBandFocus(focusedBand);
    }
    this.applyHighlight(model.highlight);
  }

  /** Tag values and port states from the core: lights sockets and edges, names diagnostics. */
  showLive(tags: ReadonlyMap<string, number>, runtime: ReadonlyMap<string, DriveRuntime>): void {
    const { model, drawn } = this;
    if (model === null || drawn === null || this.host.hidden) {
      return;
    }
    const next = liveStateOf(model.diagram, model.document, { tags, runtime }, model.translate);
    this.applyLive(drawn, model.translate, next);
    this.live = next;
  }

  // Folding a band redraws the SVG, which would drop the keyboard focus on the page.
  private focusedBandKey(): string | null {
    const active = document.activeElement;
    return active !== null && this.host.contains(active)
      ? (active.closest("[data-band]")?.getAttribute("data-band") ?? null)
      : null;
  }

  private restoreBandFocus(key: string | null): void {
    if (key === null) {
      return;
    }
    const toggle = this.host.querySelector(`[data-band="${key}"] .diagram-band__toggle`);
    if (toggle instanceof SVGElement) {
      toggle.focus();
    }
  }

  private redraw(model: ShownModel, intents: PanelIntents): void {
    this.drawn = drawDiagram(model, intents);
    // The new elements start unlit and unselected.
    this.highlight = new Map();
    this.live = NO_LIVE_STATE;
    this.emptyText.textContent = model.translate("diagram.empty");
    this.host.replaceChildren(this.drawn.svg, ...(model.empty ? [this.emptyText] : []));
  }

  private applyHighlight(next: ReadonlyMap<string, NodeHighlight>): void {
    const { drawn } = this;
    if (drawn === null) {
      return;
    }
    for (const nodeId of new Set([...this.highlight.keys(), ...next.keys()])) {
      const group = drawn.nodes.get(nodeId)?.group;
      setClass(group, "is-selected", next.get(nodeId) === "selected");
      setClass(group, "is-related", next.get(nodeId) === "related");
    }
    const { diagram } = this.model ?? { diagram: null };
    const edges = diffSets(relatedEdgeIds(diagram, this.highlight), relatedEdgeIds(diagram, next));
    applyChanges(edges, (id) => drawn.edges.get(id), "is-related");
    drawn.svg.classList.toggle("diagram--focus", next.size > 0);
    this.highlight = next;
  }

  private applyLive(drawn: DrawnDiagram, t: Translate, next: LiveState): void {
    applyChanges(
      diffSets(this.live.litSockets, next.litSockets),
      (key) => socketOf(drawn, key),
      "is-lit",
    );
    applyChanges(
      diffSets(this.live.litEdges, next.litEdges),
      (id) => drawn.edges.get(id),
      "is-lit",
    );
    for (const [nodeId, lines] of changedDiagnostics(this.live.diagnostics, next.diagnostics)) {
      const node = drawn.nodes.get(nodeId);
      if (node !== undefined) {
        showNodeWarning(node, lines, t);
      }
    }
  }
}
