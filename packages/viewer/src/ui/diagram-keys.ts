import { deviceOfDiagramNode } from "../device-selection.ts";
import {
  type Direction,
  type FocusTarget,
  firstPortOf,
  focusKeyOf,
  neighbour,
} from "../diagram/diagram-focus.ts";
import { type LinkChoice, linkChoices } from "../diagram/diagram-link-targets.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { MessageKey } from "../i18n/translate.ts";
import { deleteInDiagram } from "./diagram-delete.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The keyboard of the diagram (ADR 0029 point 7). What each key means is
// decided by the pure functions of diagram-focus.ts and diagram-link-targets.ts;
// this reads the key, finds what has the focus and calls back.

type ShownModel = Extract<DiagramModel, { shown: true }>;

export interface KeyContext {
  model(): ShownModel | null;
  intents(): PanelIntents | null;
  focusKey(key: string): void;
  // The selected link, and how to drop the selection.
  selectedEdgeId(): string | null;
  clearEdgeSelection(): void;
  // A menu of choices beside an item; `choose` gets the picked one.
  openMenu(
    opener: Element,
    title: MessageKey,
    choices: readonly LinkChoice[],
    choose: (choice: LinkChoice) => void,
  ): void;
}

// What a key press is about: the focused item and the diagram around it.
interface Call {
  item: Element;
  // Null for a link or a band, which are not nodes.
  target: FocusTarget | null;
  model: ShownModel;
  intents: PanelIntents;
  context: KeyContext;
}

// A handler says whether it did something, which stops the browser's own use of the key.
type Handler = (call: Call) => boolean;

function targetOf(element: Element): FocusTarget | null {
  const nodeId = element.closest("[data-node-id]")?.getAttribute("data-node-id");
  if (nodeId === null || nodeId === undefined) {
    return null;
  }
  const socketId = element.closest("[data-socket-id]")?.getAttribute("data-socket-id");
  return { nodeId, socketId: socketId ?? null };
}

const moveTo =
  (direction: Direction): Handler =>
  ({ target, model, context }) => {
    const next = target === null ? null : neighbour(model.diagram, target, direction);
    if (next !== null) {
      context.focusKey(focusKeyOf(next));
    }
    return next !== null;
  };

const moveToEnd =
  (last: boolean): Handler =>
  ({ model, context }) => {
    const { nodes } = model.diagram;
    const node = last ? nodes[nodes.length - 1] : nodes[0];
    if (node !== undefined) {
      context.focusKey(focusKeyOf({ nodeId: node.id, socketId: null }));
    }
    return node !== undefined;
  };

function openLinkMenu({ item, target, model, intents, context }: Call): boolean {
  if (target?.socketId === null || target === null) {
    return false;
  }
  const from = { nodeId: target.nodeId, socketId: target.socketId };
  const choices = linkChoices(model.document, model.diagram, from);
  if (choices.length === 0) {
    intents.showDiagramHint("diagram.hint.noLinkChoices");
  } else {
    context.openMenu(item, "diagram.linkTo", choices, (choice) =>
      intents.linkDiagramNodes(from, choice.endpoint),
    );
  }
  return true;
}

// Enter goes in: from a node to its first port, from a port to "Relier à…".
const enter: Handler = (call) => {
  const { target, model, context } = call;
  if (target === null) {
    return false;
  }
  if (target.socketId !== null) {
    return openLinkMenu(call);
  }
  const port = firstPortOf(model.diagram, target.nodeId);
  if (port !== null) {
    context.focusKey(focusKeyOf(port));
  }
  return port !== null;
};

const space: Handler = ({ target, intents }) => {
  if (target?.socketId === null) {
    intents.selectDiagramNode(target.nodeId);
  }
  return target?.socketId === null;
};

// Escape steps back: drops a selected link, and goes from a port to its node.
const stepBack: Handler = ({ target, context }) => {
  const hadSelection = context.selectedEdgeId() !== null;
  context.clearEdgeSelection();
  if (target !== null && target.socketId !== null) {
    context.focusKey(focusKeyOf({ nodeId: target.nodeId, socketId: null }));
    return true;
  }
  return hadSelection;
};

// Delete removes a link, never an element: the window's Delete would remove the
// selected element, which is not what the focus says (ADR 0030 point 4).
const remove: Handler = ({ item, target, model, intents, context }) => {
  deleteInDiagram({
    edgeId: item.getAttribute("data-edge-id"),
    target,
    diagram: model.diagram,
    intents,
    openMenu: (title, choices, choose) => context.openMenu(item, title, choices, choose),
  });
  return true;
};

// F2 on a device node: the node has the focus, so it is the one to rename,
// whatever is selected. The window's F2 would rename the selection.
const rename: Handler = ({ target, intents }) => {
  if (target === null || deviceOfDiagramNode(target.nodeId) === null) {
    return false;
  }
  intents.selectDiagramNode(target.nodeId);
  intents.runMenuCommand("rename");
  return true;
};

const HANDLERS: Readonly<Record<string, Handler>> = {
  ArrowLeft: moveTo("left"),
  ArrowRight: moveTo("right"),
  ArrowUp: moveTo("up"),
  ArrowDown: moveTo("down"),
  Home: moveToEnd(false),
  End: moveToEnd(true),
  Enter: enter,
  " ": space,
  Escape: stepBack,
  Delete: remove,
  F2: rename,
  ContextMenu: openLinkMenu,
};

export function listenToDiagramKeys(svg: SVGElement, context: KeyContext): void {
  svg.addEventListener("keydown", (event) => {
    const model = context.model();
    const intents = context.intents();
    const item = event.target instanceof Element ? event.target.closest("[data-focus]") : null;
    const handler = HANDLERS[event.key];
    if (model === null || intents === null || item === null || handler === undefined) {
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const call = { item, target: targetOf(item), model, intents, context };
    if (handler(call)) {
      event.preventDefault();
    }
  });
}
