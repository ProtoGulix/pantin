import type { Translate } from "../i18n/translate.ts";
import { type FocusTarget, menuBarKeyAction } from "../menu/menu-bar-navigation.ts";
import type { MenuCommand, MenuEntryView, MenuView } from "../menu/menu-model.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import type { ToolbarCallbacks } from "./toolbar.ts";

// Desktop-style menu bar (WAI-ARIA menubar pattern). Only which menu is open
// and where focus goes live here; items and their rules come from the menu
// model. Opens on click, arrows move, Escape closes.

const ITEM_SELECTOR = "[role=menuitem], [role=menuitemradio]";

function entryElement(entry: MenuEntryView): HTMLElement {
  if (entry.type === "separator") {
    return element("div", { className: "menu__separator", attributes: { role: "separator" } });
  }
  const attributes: Record<string, string> = {
    type: "button",
    role: entry.checked === null ? "menuitem" : "menuitemradio",
    tabindex: "-1",
    "data-command": entry.command,
    "aria-disabled": String(!entry.enabled),
  };
  if (entry.checked !== null) {
    attributes["aria-checked"] = String(entry.checked);
  }
  return element("button", { className: "menu__item", attributes }, [
    element("span", { className: "menu__check", text: entry.checked ? "•" : "" }),
    element("span", { className: "menu__label", text: entry.label }),
    element("span", { className: "menu__shortcut", text: entry.shortcutLabel ?? "" }),
  ]);
}

function menuElement(menu: MenuView, index: number, open: boolean, tabbable: boolean): HTMLElement {
  const title = element("button", {
    className: "menubar__title",
    text: menu.label,
    attributes: {
      type: "button",
      role: "menuitem",
      "aria-haspopup": "menu",
      "aria-expanded": String(open),
      tabindex: tabbable ? "0" : "-1",
      "data-menu-index": String(index),
    },
  });
  const popup = open
    ? element(
        "div",
        { className: "menu", attributes: { role: "menu", "aria-label": menu.label } },
        menu.entries.map(entryElement),
      )
    : null;
  // role=none: the wrapper must not hide the menu items from the menubar.
  return element("div", { className: "menubar__menu", attributes: { role: "none" } }, [
    title,
    popup,
  ]);
}

export class MenuBar {
  private readonly bar: HTMLElement;
  private readonly callbacks: ToolbarCallbacks;
  private menus: MenuView[] = [];
  private intents: PanelIntents | null = null;
  private openIndex: number | null = null;
  // Roving tabindex: Tab comes back to the menu the user last focused.
  private tabbableIndex = 0;

  constructor(bar: HTMLElement, callbacks: ToolbarCallbacks) {
    this.bar = bar;
    this.callbacks = callbacks;
    bar.setAttribute("role", "menubar");
    bar.addEventListener("click", (event) => this.onClick(event));
    bar.addEventListener("pointerover", (event) => this.onHover(event));
    bar.addEventListener("keydown", (event) => this.onKey(event));
    bar.addEventListener("focusin", () => {
      const focus = this.currentFocus();
      if (focus !== null && focus.menu >= 0) {
        this.tabbableIndex = focus.menu;
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (this.openIndex !== null && event.target instanceof Node && !bar.contains(event.target)) {
        this.show(null, null);
      }
    });
  }

  render(menus: MenuView[], translate: Translate, intents: PanelIntents): void {
    this.menus = menus;
    this.intents = intents;
    this.bar.setAttribute("aria-label", translate("menubar.label"));
    // A store update must not steal the keyboard from an open menu.
    this.draw(this.currentFocus());
  }

  private draw(focus: FocusTarget | null): void {
    if (focus !== null && focus.menu >= 0) {
      this.tabbableIndex = focus.menu;
    }
    this.tabbableIndex = Math.min(this.tabbableIndex, Math.max(this.menus.length - 1, 0));
    this.bar.replaceChildren(
      ...this.menus.map((menu, index) =>
        menuElement(menu, index, index === this.openIndex, index === this.tabbableIndex),
      ),
    );
    if (focus === null) {
      return;
    }
    const menu = this.bar.children[focus.menu];
    const target =
      focus.item === null
        ? menu?.querySelector<HTMLElement>(".menubar__title")
        : menu?.querySelectorAll<HTMLElement>(ITEM_SELECTOR)[focus.item];
    target?.focus();
  }

  private show(menuIndex: number | null, focus: FocusTarget | null): void {
    this.openIndex = menuIndex;
    this.draw(focus);
  }

  private run(command: MenuCommand): void {
    this.show(null, null);
    if (command === "import") {
      // The file picker must open inside this click or key press (user gesture).
      this.callbacks.openFilePicker(null);
    } else {
      this.intents?.runMenuCommand(command);
    }
  }

  // The command is looked up in the model rather than trusted from the DOM,
  // which also gives its enabled state.
  private runEnabled(text: string | undefined): void {
    for (const menu of this.menus) {
      for (const entry of menu.entries) {
        if (entry.type === "item" && entry.command === text && entry.enabled) {
          this.run(entry.command);
          return;
        }
      }
    }
  }

  private onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const title = target?.closest<HTMLElement>("[data-menu-index]");
    const item = target?.closest<HTMLElement>("[data-command]");
    if (title) {
      const index = Number(title.dataset.menuIndex);
      this.show(this.openIndex === index ? null : index, { menu: index, item: null });
    } else if (item) {
      this.runEnabled(item.dataset.command);
    }
  }

  private onHover(event: PointerEvent): void {
    const title =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-menu-index]")
        : null;
    const index = title ? Number(title.dataset.menuIndex) : null;
    // Moving across the bar while a menu is open switches menus, as on the desktop.
    if (index !== null && this.openIndex !== null && index !== this.openIndex) {
      this.show(index, { menu: index, item: null });
    }
  }

  private onKey(event: KeyboardEvent): void {
    const handled = menuBarKeyAction(
      event.key,
      this.currentFocus(),
      this.openIndex,
      this.menus.length,
      this.itemCount(),
    );
    if (handled === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (handled.type === "activate") {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) {
        this.runEnabled(focused.dataset.command);
      }
      return;
    }
    this.show(handled.open, handled.focus);
  }

  private currentFocus(): FocusTarget | null {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !this.bar.contains(focused)) {
      return null;
    }
    const menuIndex = [...this.bar.children].findIndex((menu) => menu.contains(focused));
    const items = [...(this.bar.children[menuIndex]?.querySelectorAll(ITEM_SELECTOR) ?? [])];
    const itemIndex = items.indexOf(focused);
    return { menu: menuIndex, item: itemIndex < 0 ? null : itemIndex };
  }

  private itemCount(): number {
    return this.openIndex === null
      ? 0
      : (this.bar.children[this.openIndex]?.querySelectorAll(ITEM_SELECTOR).length ?? 0);
  }
}
