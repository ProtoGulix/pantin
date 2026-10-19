import type { StarHighlight } from "../joint-star/joint-star-highlight.ts";
import { treeNodeIdOfJoint, treeNodeIdOfStarNode } from "../joint-star/joint-star-ids.ts";
import type { StarLayout } from "../joint-star/joint-star-layout.ts";
import {
  ARROW_DIRECTIONS,
  neighbourOf,
  type StarNeighbours,
  starNeighbours,
} from "../joint-star/joint-star-navigation.ts";
import type { JointStarModel } from "../joint-star/joint-star-view-model.ts";
import { RovingFocus } from "./diagram-roving.ts";
import { element } from "./dom.ts";
import { JointStarCamera } from "./joint-star-camera.ts";
import { type DrawnStar, drawJointStar } from "./joint-star-draw.ts";
import { JointStarLegend } from "./joint-star-legend.ts";
import { paintHighlight } from "./joint-star-paint.ts";
import { type StarTarget, starTargetAt } from "./joint-star-targets.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { markAsZoneView } from "./zone-view.ts";

// The joint tree in a zone of the central area (ADR 0059). It is redrawn when the layout or the
// fold changes; the selection is applied in place, and zoom and pan only move the drawn positions.
// The pointer and the keyboard end in the same intents as the tree, so the star selects, frames and
// opens the context menu exactly as a tree row does. It never edits.

type ShownModel = Extract<JointStarModel, { shown: true }>;

const HELP_ID = "joint-star-help";

function targetElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

export class JointStarView {
  private readonly host = element("div", { className: "joint-star" });
  private readonly emptyText = element("p", { className: "joint-star__empty" });
  private readonly legend = new JointStarLegend();
  private readonly roving = new RovingFocus();
  private readonly fitButton = element("button", {
    className: "joint-star__fit",
    attributes: { type: "button" },
  });
  private model: ShownModel | null = null;
  private intents: PanelIntents | null = null;
  private layout: StarLayout | null = null;
  // Nodes whose following bodies are shown. Never saved.
  private unfolded: ReadonlySet<string> = new Set();
  private drawn: DrawnStar | null = null;
  private readonly camera = new JointStarCamera(this.host, (viewport) =>
    this.drawn?.project(viewport),
  );
  private neighbours: StarNeighbours = new Map();
  // The star goes under `before` (the welcome overlay); central-area.ts places it with CSS.
  constructor(viewport: HTMLElement, before: HTMLElement) {
    markAsZoneView(this.host, "joints");
    this.host.hidden = true;
    viewport.insertBefore(this.host, before);
    // The first size can come after the first draw, and panels open and close around it:
    // until the user moves the view, it keeps showing the whole tree.
    new ResizeObserver(() => this.camera.isAutomatic && this.fit()).observe(this.host);
    this.listen();
  }

  render(model: JointStarModel, intents: PanelIntents): void {
    this.host.hidden = !model.shown;
    if (!model.shown) {
      return;
    }
    const previous = this.model;
    const restart =
      previous?.layoutFor !== model.layoutFor || previous.translate !== model.translate;
    if (previous !== null && previous.pantinId !== model.pantinId) {
      this.unfolded = new Set();
      this.camera.forget();
    }
    this.model = model;
    this.intents = intents;
    if (restart || this.layout === null) {
      this.redraw(model);
    }
    if (this.layout !== null) {
      this.applyHighlight(model.highlightFor(this.layout));
    }
  }

  private redraw(model: ShownModel): void {
    const layout = model.layoutFor(this.unfolded);
    const hadFocus = this.roving.holdsFocus(this.drawn?.svg ?? null);
    const drawn = drawJointStar(layout, model.translate);
    this.layout = layout;
    this.drawn = drawn;
    this.neighbours = starNeighbours(layout);
    this.emptyText.textContent = model.translate("jointStar.empty");
    this.fitButton.textContent = model.translate("jointStar.fit");
    this.fitButton.title = model.translate("jointStar.fit.title");
    this.legend.render(model.translate);
    const help = element("p", {
      className: "visually-hidden",
      text: model.translate("jointStar.help"),
      attributes: { id: HELP_ID },
    });
    this.host.replaceChildren(
      help,
      drawn.svg,
      ...(layout.nodes.length === 1 ? [this.emptyText] : []),
      element("div", { className: "joint-star__controls" }, [this.fitButton]),
      this.legend.root,
    );
    this.roving.attach(drawn, "world", hadFocus);
    // A redraw after an edit or a fold keeps the view where the user left it.
    if (this.camera.current === null) {
      this.fit();
    } else {
      this.camera.useLayout(layout);
      drawn.project(this.camera.current);
    }
  }

  private fit(): void {
    if (this.layout !== null) {
      this.camera.fit(this.layout);
    }
  }

  private applyHighlight(next: StarHighlight): void {
    const { drawn } = this;
    if (drawn === null) {
      return;
    }
    paintHighlight(drawn, next);
  }

  private listen(): void {
    this.host.addEventListener("click", (event) => this.onClick(event));
    this.host.addEventListener("dblclick", (event) => this.onDoubleClick(event));
    this.host.addEventListener("contextmenu", (event) => this.onContextMenu(event));
    this.host.addEventListener("keydown", (event) => this.onKeyDown(event));
    this.host.addEventListener("focusin", (event) => this.revealFocused(event));
    this.fitButton.addEventListener("click", () => this.fit());
  }

  // Keyboard focus brings its node back into the area; a mouse click does not move the view.
  private revealFocused(event: FocusEvent): void {
    const target = targetElement(event);
    const nodeId = target?.closest("[data-node-id]")?.getAttribute("data-node-id");
    const placed = this.drawn?.nodes.get(nodeId ?? "")?.placed;
    if (placed !== undefined && target?.matches(":focus-visible")) {
      this.camera.reveal(placed);
    }
  }

  private toggleFold(nodeId: string): void {
    const { model } = this;
    if (model === null) {
      return;
    }
    const next = new Set(this.unfolded);
    if (!next.delete(nodeId)) {
      next.add(nodeId);
    }
    this.unfolded = next;
    this.redraw(model);
    if (this.layout !== null) {
      this.applyHighlight(model.highlightFor(this.layout));
    }
  }

  // "+" unfolds and "-" folds, only when the node has something to show or to hide.
  private setFold(nodeId: string, unfold: boolean): void {
    const placed = this.drawn?.nodes.get(nodeId)?.placed;
    if (placed?.hasToggle && placed.unfolded !== unfold) {
      this.toggleFold(nodeId);
    }
  }

  private targetAt(event: Event): StarTarget | null {
    const { model, drawn } = this;
    return model === null || drawn === null
      ? null
      : starTargetAt(targetElement(event), model.pantinId, drawn);
  }

  private onClick(event: MouseEvent): void {
    const toggleId = targetElement(event)
      ?.closest("[data-toggle-id]")
      ?.getAttribute("data-toggle-id");
    if (toggleId !== null && toggleId !== undefined) {
      this.toggleFold(toggleId);
      return;
    }
    const target = this.targetAt(event);
    if (target !== null) {
      this.intents?.selectNode(target.row);
    }
  }

  // Frames in the 3D view when it is shown; alone, the layout never changes by itself,
  // so it only selects (a click has already done it).
  private onDoubleClick(event: MouseEvent): void {
    const target = this.targetAt(event);
    if (target === null || targetElement(event)?.closest("[data-toggle-id]")) {
      return;
    }
    if (this.model?.viewportShown) {
      this.intents?.frameNode(target.framedRow);
    } else {
      this.intents?.selectNode(target.row);
    }
  }

  private onContextMenu(event: MouseEvent): void {
    // The browser's own menu has nothing to offer here.
    event.preventDefault();
    const target = this.targetAt(event);
    if (target !== null) {
      this.intents?.openContextMenu(target.row, event.clientX, event.clientY);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    const { model, intents } = this;
    const node = targetElement(event)?.closest("[data-node-id]");
    const nodeId = node?.getAttribute("data-node-id") ?? null;
    if (model === null || intents === null || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (nodeId === null) {
      return;
    }
    if (this.guardEditingKeys(event, model, nodeId)) {
      return;
    }
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction !== undefined) {
      event.preventDefault();
      const next = neighbourOf(this.neighbours, nodeId, direction);
      if (next !== null) {
        this.roving.focus(next);
      }
      return;
    }
    this.runNodeKey(event, model, intents, nodeId, node);
  }

  // Delete and F2 act on the selection (ADR 0059 point 8): from another node they are swallowed.
  private guardEditingKeys(event: KeyboardEvent, model: ShownModel, nodeId: string): boolean {
    if (event.key !== "Delete" && event.key !== "F2") {
      return false;
    }
    // Its own row, not the highlight: a folded body is marked on its group.
    if (!model.selectedTreeIds.has(treeNodeIdOfStarNode(model.pantinId, nodeId))) {
      event.preventDefault();
    }
    return true;
  }

  private runNodeKey(
    event: KeyboardEvent,
    model: ShownModel,
    intents: PanelIntents,
    nodeId: string,
    node: Element | null | undefined,
  ): void {
    const row = treeNodeIdOfStarNode(model.pantinId, nodeId);
    if (event.key === " ") {
      event.preventDefault();
      intents.selectNode(row);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // The layout never changes on its own: alone, Enter only selects.
      if (model.viewportShown) {
        intents.frameNode(row);
      } else {
        intents.selectNode(row);
      }
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      this.setFold(nodeId, true);
    } else if (event.key === "-") {
      event.preventDefault();
      this.setFold(nodeId, false);
    } else if (event.key === "j" || event.key === "J") {
      this.selectParentJoint(model, intents, nodeId);
    } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const rect = node?.getBoundingClientRect();
      intents.openContextMenu(row, rect?.left ?? 0, rect?.bottom ?? 0);
    }
  }

  private selectParentJoint(model: ShownModel, intents: PanelIntents, nodeId: string): void {
    const jointId = this.drawn?.edges.get(nodeId)?.jointId;
    if (jointId !== undefined) {
      intents.selectNode(treeNodeIdOfJoint(model.pantinId, jointId));
    }
  }
}
