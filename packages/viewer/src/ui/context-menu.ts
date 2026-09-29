import type { ContextAction, ContextMenuView } from "../panel/context-menu-model.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import type { ToolbarCallbacks } from "./toolbar.ts";

// Right-click menu of a tree node (role=menu), placed at the pointer and kept
// inside the window. Arrow keys move between entries, Escape closes it.

function runAction(
  action: ContextAction,
  nodeId: string,
  intents: PanelIntents,
  callbacks: ToolbarCallbacks,
): void {
  if (action === "rename") {
    intents.startRename(nodeId);
  } else if (action === "frame") {
    intents.frameNode(nodeId);
  } else if (action === "delete") {
    intents.requestDelete(nodeId);
  } else {
    // The file picker must open inside this click: browsers require a user gesture.
    intents.closeContextMenu();
    callbacks.openFilePicker(parseNodeId(nodeId)?.pantinId ?? null);
  }
}

function moveFocus(menu: HTMLElement, step: number): void {
  const items = [...menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
  const active = document.activeElement;
  const index = active instanceof HTMLButtonElement ? items.indexOf(active) : -1;
  items[(index + step + items.length) % items.length]?.focus();
}

function menuItem(
  entry: ContextMenuView["entries"][number],
  view: ContextMenuView,
  intents: PanelIntents,
  callbacks: ToolbarCallbacks,
): HTMLElement {
  const item = element("button", {
    className: "context-menu__item",
    text: entry.label,
    attributes: { type: "button", role: "menuitem" },
  });
  item.addEventListener("click", () => runAction(entry.action, view.nodeId, intents, callbacks));
  return item;
}

function listenToMenuKeys(menu: HTMLElement, intents: PanelIntents): void {
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      intents.closeContextMenu();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(menu, event.key === "ArrowDown" ? 1 : -1);
    }
  });
}

// Kept inside the window once inserted, when its size is known.
function placeInWindow(menu: HTMLElement, view: ContextMenuView, focusFirstEntry: boolean): void {
  requestAnimationFrame(() => {
    menu.style.left = `${Math.min(view.x, window.innerWidth - menu.offsetWidth - 4)}px`;
    menu.style.top = `${Math.min(view.y, window.innerHeight - menu.offsetHeight - 4)}px`;
    if (focusFirstEntry) {
      menu.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    }
  });
}

export function renderContextMenu(
  view: ContextMenuView,
  intents: PanelIntents,
  callbacks: ToolbarCallbacks,
  focusFirstEntry: boolean,
): HTMLElement {
  const menu = element(
    "div",
    {
      className: "context-menu",
      attributes: {
        role: "menu",
        "aria-label": view.title,
        style: `left: ${view.x}px; top: ${view.y}px`,
      },
    },
    view.entries.map((entry) => menuItem(entry, view, intents, callbacks)),
  );
  listenToMenuKeys(menu, intents);
  placeInWindow(menu, view, focusFirstEntry);
  return menu;
}
