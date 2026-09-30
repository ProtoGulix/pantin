import type { DriveRuntime } from "@pantin/protocol";
import { focusKeyOf } from "../diagram/diagram-focus.ts";
import { type LitState, socketLitStates } from "../diagram/diagram-lit-states.ts";
import { diffSets, type LiveState, liveStateOf, NO_LIVE_STATE } from "../diagram/diagram-live.ts";
import { type NodeHighlight, relatedEdgeIds } from "../diagram/diagram-selection.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { MessageKey } from "../i18n/translate.ts";
import { drawColumnHeads } from "./diagram-columns.ts";
import { listenToLinkDrags } from "./diagram-drag.ts";
import { type DrawnDiagram, drawDiagram, HELP_ID } from "./diagram-draw.ts";
import { EdgeSelection } from "./diagram-edge-select.ts";
import { listenToDiagramKeys } from "./diagram-keys.ts";
import { LinkMenu } from "./diagram-link-menu.ts";
import { applyChanges, applyLitText, applyLive } from "./diagram-live-apply.ts";
import { RovingFocus } from "./diagram-roving.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The chain diagram in the central area (ADR 0029). It is redrawn when the
// layout changes; selection and live state are applied in place and only to
// the elements that changed, because tags are read four times a second. The
// pointer (diagram-drag.ts) and the keyboard (diagram-keys.ts) both end in the
// same intents, so that they edit the same way.

type ShownModel = Extract<DiagramModel, { shown: true }>;

const SHOWN_CLASS = "viewport--diagram";

export class DiagramView {
  private readonly host = element("div", {
    className: "diagram",
    // The scroll container is itself a tab stop, so that the arrow keys scroll it
    // for a keyboard user who is not on a node.
    attributes: { tabindex: "0", role: "region" },
  });
  private readonly emptyText = element("p", { className: "diagram__empty" });
  private readonly viewport: HTMLElement;
  private readonly roving = new RovingFocus();
  private readonly edgeSelection = new EdgeSelection();
  private readonly linkMenu = new LinkMenu();
  private model: ShownModel | null = null;
  private intents: PanelIntents | null = null;
  private drawn: DrawnDiagram | null = null;
  private highlight: ReadonlyMap<string, NodeHighlight> = new Map();
  private live: LiveState = NO_LIVE_STATE;
  private litStates: ReadonlyMap<string, LitState> = new Map();

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
      this.linkMenu.close(false);
      return;
    }
    // The builder hands the same diagram object while nothing changed the layout.
    const redraw = this.model?.diagram !== model.diagram;
    this.model = model;
    this.intents = intents;
    this.host.setAttribute("aria-label", model.translate("diagram.label"));
    if (redraw) {
      this.redraw(model, intents);
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
    const nextStates = socketLitStates(model.diagram, next);
    applyLive(drawn, model.translate, this.live, next);
    applyLitText(drawn, model.translate, this.litStates, nextStates);
    this.live = next;
    this.litStates = nextStates;
  }

  private redraw(model: ShownModel, intents: PanelIntents): void {
    // Every edit redraws: the keyboard user must find their place again.
    const hadFocus = this.roving.holdsFocus(this.drawn?.svg ?? null);
    this.linkMenu.close(false);
    const drawn = drawDiagram(model, intents);
    this.drawn = drawn;
    // The new elements start unlit and unselected.
    this.highlight = new Map();
    this.live = NO_LIVE_STATE;
    this.litStates = new Map();
    this.emptyText.textContent = model.translate("diagram.empty");
    const help = element("p", {
      className: "visually-hidden",
      text: model.translate("diagram.help"),
      attributes: { id: HELP_ID },
    });
    this.host.replaceChildren(
      help,
      drawColumnHeads(model, intents),
      drawn.svg,
      ...(model.empty ? [this.emptyText] : []),
    );
    this.listen(drawn);
    const first = model.diagram.nodes[0];
    const firstKey = first === undefined ? null : focusKeyOf({ nodeId: first.id, socketId: null });
    this.roving.attach(drawn, firstKey, hadFocus);
    this.edgeSelection.reapply(drawn, model.diagram.edges, model.translate, intents);
  }

  private listen(drawn: DrawnDiagram): void {
    const context = {
      model: () => this.model,
      drawn: () => this.drawn,
      intents: () => this.intents,
    };
    listenToLinkDrags(drawn.svg, context);
    listenToDiagramKeys(drawn.svg, {
      ...context,
      focusKey: (key) => this.roving.focus(key),
      selectedEdgeId: () => this.edgeSelection.id,
      clearEdgeSelection: () => this.selectEdge(null),
      openMenu: (opener, title, choices, choose) => this.openMenu(opener, title, choices, choose),
    });
    drawn.svg.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      this.selectEdge(target?.closest("[data-edge-id]")?.getAttribute("data-edge-id") ?? null);
    });
  }

  private selectEdge(edgeId: string | null): void {
    const { model, drawn, intents } = this;
    if (model !== null && drawn !== null && intents !== null) {
      this.edgeSelection.select(drawn, model.diagram.edges, edgeId, model.translate, intents);
    }
  }

  private openMenu(
    opener: Element,
    title: MessageKey,
    choices: Parameters<LinkMenu["open"]>[3],
    choose: Parameters<LinkMenu["open"]>[4],
  ): void {
    if (this.model !== null) {
      this.linkMenu.open(this.host, opener, this.model.translate(title), choices, choose);
    }
  }

  private applyHighlight(next: ReadonlyMap<string, NodeHighlight>): void {
    const { drawn } = this;
    if (drawn === null) {
      return;
    }
    for (const nodeId of new Set([...this.highlight.keys(), ...next.keys()])) {
      const group = drawn.nodes.get(nodeId)?.group;
      const state = next.get(nodeId);
      group?.classList.toggle("is-selected", state === "selected");
      group?.classList.toggle("is-related", state === "related");
      // The selected node is the current one of the set, not a selection in a list.
      if (state === "selected") {
        group?.setAttribute("aria-current", "true");
      } else {
        group?.removeAttribute("aria-current");
      }
    }
    const { diagram } = this.model ?? { diagram: null };
    const edges = diffSets(relatedEdgeIds(diagram, this.highlight), relatedEdgeIds(diagram, next));
    applyChanges(edges, (id) => drawn.edges.get(id), "is-related");
    drawn.svg.classList.toggle("diagram--focus", next.size > 0);
    this.highlight = next;
  }
}
