import type { DriveRuntime } from "@pantin/protocol";
import { focusKeyOf } from "../diagram/diagram-focus.ts";
import { forcedDisplayNumber, forcedValueText } from "../diagram/diagram-forcing.ts";
import { type LitState, socketLitStates } from "../diagram/diagram-lit-states.ts";
import { diffSets, type LiveState, liveStateOf, NO_LIVE_STATE } from "../diagram/diagram-live.ts";
import { type NodeHighlight, relatedEdgeIds } from "../diagram/diagram-selection.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import { forcedTagUnit, forcedTagUnitLabel } from "../drives/drive-tags.ts";
import type { MessageKey } from "../i18n/translate.ts";
import { drawColumnHeads } from "./diagram-columns.ts";
import { listenToLinkDrags } from "./diagram-drag.ts";
import { type DrawnDiagram, drawDiagram, HELP_ID } from "./diagram-draw.ts";
import { EdgeSelection } from "./diagram-edge-select.ts";
import { listenToSocketClicks, submitForcedValue } from "./diagram-forcing.ts";
import { unhandledKeyInDiagram } from "./diagram-key-policy.ts";
import { listenToDiagramKeys } from "./diagram-keys.ts";
import { LinkMenu } from "./diagram-link-menu.ts";
import { applyChanges, applyForcedValues, applyLitText, applyLive } from "./diagram-live-apply.ts";
import { RovingFocus } from "./diagram-roving.ts";
import { ValueInput } from "./diagram-value-input.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { isEditable } from "./shortcuts.ts";

// The chain diagram in the central area (ADR 0029). It is redrawn when the
// layout changes; selection and live state are applied in place and only to
// the elements that changed, because tags are read four times a second. The
// pointer (diagram-drag.ts) and the keyboard (diagram-keys.ts) both end in the
// same intents, so that they edit the same way.

type ShownModel = Extract<DiagramModel, { shown: true }>;

export class DiagramView {
  private readonly host = element("div", {
    className: "diagram",
    // The scroll container is itself a tab stop, so that the arrow keys scroll it
    // for a keyboard user who is not on a node.
    attributes: { tabindex: "0", role: "region" },
  });
  private readonly emptyText = element("p", { className: "diagram__empty" });
  private readonly roving = new RovingFocus();
  private readonly edgeSelection = new EdgeSelection();
  private readonly linkMenu = new LinkMenu();
  private readonly valueInput = new ValueInput();
  private model: ShownModel | null = null;
  private intents: PanelIntents | null = null;
  private drawn: DrawnDiagram | null = null;
  private highlight: ReadonlyMap<string, NodeHighlight> = new Map();
  private live: LiveState = NO_LIVE_STATE;
  private litStates: ReadonlyMap<string, LitState> = new Map();
  private tags: ReadonlyMap<string, number> = new Map();

  // The diagram goes under `before` (the welcome overlay); central-area.ts
  // places it over the canvas, or under it.
  constructor(viewport: HTMLElement, before: HTMLElement) {
    this.host.hidden = true;
    viewport.insertBefore(this.host, before);
    this.guardWindowShortcuts();
  }

  // The diagram's own handlers run first (they are deeper); what none of them
  // took must not reach the window's Delete and F2 (diagram-key-policy.ts).
  private guardWindowShortcuts(): void {
    this.host.addEventListener("keydown", (event) => {
      const { key, ctrlKey, metaKey, altKey } = event;
      const press = { key, ctrlKey, metaKey, altKey, inEditableField: isEditable(event.target) };
      const action = event.defaultPrevented ? "pass" : unhandledKeyInDiagram(press);
      if (action !== "pass") {
        event.preventDefault();
      }
      if (action === "hint") {
        this.intents?.showDiagramHint("diagram.hint.deleteOnPort");
      }
    });
  }

  render(model: DiagramModel, intents: PanelIntents): void {
    this.host.hidden = !model.shown;
    if (!model.shown) {
      this.linkMenu.close(false);
      this.valueInput.close(false);
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
    const forced = { diagram: model.diagram, document: model.document, t: model.translate };
    applyForcedValues(drawn, forced, this.tags, tags);
    this.tags = tags;
    this.live = next;
    this.litStates = nextStates;
  }

  private redraw(model: ShownModel, intents: PanelIntents): void {
    // Every edit redraws: the keyboard user must find their place again.
    // An open value input holds the focus too: the socket gets it back.
    const hadFocus = this.roving.holdsFocus(this.drawn?.svg ?? null) || this.valueInput.isOpen();
    this.linkMenu.close(false);
    this.valueInput.close(false);
    const drawn = drawDiagram(model, intents);
    this.drawn = drawn;
    // The new elements start unlit and unselected.
    this.highlight = new Map();
    this.live = NO_LIVE_STATE;
    this.litStates = new Map();
    this.tags = new Map();
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
    const openValueInput = (opener: Element, tag: string) => this.openValueInput(opener, tag);
    listenToLinkDrags(drawn.svg, context);
    listenToSocketClicks(drawn.svg, { ...context, openValueInput });
    listenToDiagramKeys(drawn.svg, {
      ...context,
      focusKey: (key) => this.roving.focus(key),
      openValueInput,
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

  private openValueInput(opener: Element, tag: string): void {
    const { model, intents } = this;
    const socket = model?.diagram.nodes
      .flatMap((node) => node.sockets)
      .find((candidate) => candidate.tagName === tag);
    if (model === null || intents === null || socket === undefined) {
      return;
    }
    const t = model.translate;
    const unit = forcedTagUnitLabel(model.document, tag, t);
    const value = this.tags.get(tag);
    const conversion = forcedTagUnit(model.document, tag);
    const spec = {
      label:
        value === undefined
          ? t("diagram.input.label", { name: socket.label })
          : t("diagram.input.labelValue", {
              name: socket.label,
              value: forcedValueText(value, conversion, unit),
            }),
      unit,
      invalidText: t("diagram.input.invalid"),
      initial: value === undefined ? "" : forcedDisplayNumber(value, conversion),
    };
    this.valueInput.open(this.host, opener, spec, (text) => submitForcedValue(tag, text, intents));
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
