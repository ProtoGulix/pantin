import { createTranslator, type Translate } from "../i18n/translate.ts";
import { menuContext } from "../menu/menu-context.ts";
import {
  STANDARD_VIEW_IDS,
  STANDARD_VIEWS,
  type StandardViewId,
} from "../navigation/standard-views.ts";
import type { ViewerState } from "../viewer-state.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { isEditable } from "./shortcuts.ts";

// Space opens the list of the standard views at the pointer (ADR 0036 point
// 7), as in SolidWorks. It reuses the look of the tree's context menu. Only
// with nothing in particular focused (the canvas or the page): on a button,
// in the tree or in the diagram, Space keeps its own meaning. Closing the list
// gives the focus back to the canvas, so the arrows keep turning the view.

function viewListMenu(translate: Translate, choose: (viewId: StandardViewId) => void): HTMLElement {
  const items = STANDARD_VIEW_IDS.map((id) => {
    const item = element("button", {
      className: "context-menu__item",
      text: translate(STANDARD_VIEWS[id].labelKey),
      attributes: { type: "button", role: "menuitem" },
    });
    item.addEventListener("click", () => choose(id));
    return item;
  });
  return element(
    "div",
    {
      className: "context-menu",
      attributes: { role: "menu", "aria-label": translate("viewList.label") },
    },
    items,
  );
}

function moveFocus(menu: HTMLElement, step: number): void {
  const items = [...menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
  const active = document.activeElement;
  const index = active instanceof HTMLButtonElement ? items.indexOf(active) : -1;
  items[(index + step + items.length) % items.length]?.focus();
}

interface Popup {
  show(): void;
  close(): void;
  isOpenOn(target: EventTarget | null): boolean;
}

// Kept inside the window once inserted, when its size is known.
function placeInWindow(menu: HTMLElement, x: number, y: number): void {
  menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - 4)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 4)}px`;
}

function createPopup(
  state: () => ViewerState,
  intents: PanelIntents,
  at: () => Point,
  canvas: HTMLElement,
): Popup {
  let open: HTMLElement | null = null;
  const close = (): void => {
    if (open?.contains(document.activeElement)) {
      canvas.focus({ preventScroll: true });
    }
    open?.remove();
    open = null;
  };
  return {
    close,
    isOpenOn: (target) => open !== null && target instanceof Node && open.contains(target),
    show() {
      close();
      const translate = createTranslator(state().language);
      const menu = viewListMenu(translate, (viewId) => {
        close();
        intents.runMenuCommand(`view:${viewId}`);
      });
      menu.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          close();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(menu, event.key === "ArrowDown" ? 1 : -1);
        }
      });
      document.body.append(menu);
      placeInWindow(menu, at().x, at().y);
      menu.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
      open = menu;
    },
  };
}

interface Point {
  x: number;
  y: number;
}

export function listenToViewListKey(
  state: () => ViewerState,
  intents: PanelIntents,
  canvas: HTMLElement,
): void {
  let pointer: Point = { x: 0, y: 0 };
  window.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
  });
  const popup = createPopup(state, intents, () => pointer, canvas);
  // A click anywhere else closes it, before that click does its own work.
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!popup.isOpenOn(event.target)) {
        popup.close();
      }
    },
    { capture: true },
  );
  document.addEventListener("keydown", (event) => {
    const free = event.target === document.body || event.target instanceof HTMLCanvasElement;
    const plain = !(event.ctrlKey || event.metaKey || event.altKey);
    if (
      event.key === " " &&
      plain &&
      free &&
      !event.defaultPrevented &&
      !isEditable(event.target)
    ) {
      if (menuContext(state()).viewsAvailable) {
        event.preventDefault();
        popup.show();
      }
    }
  });
}
