import type { LinkChoice } from "../diagram/diagram-link-targets.ts";
import { element } from "./dom.ts";

// "Relier à…" (ADR 0029 point 7): the keyboard's way to wire. A menu beside the
// focused port lists what it can be linked to; Enter links, Escape gives the
// focus back to the port. It reuses the tree context menu's look.

export class LinkMenu {
  private menu: HTMLElement | null = null;
  private opener: Element | null = null;
  // Capture phase: a click anywhere else closes it, even on what stops propagation.
  private readonly onOutsideClick = (event: MouseEvent) => {
    if (!(event.target instanceof Node && this.menu?.contains(event.target))) {
      this.close(false);
    }
  };

  /** Opens the menu under `opener`, and calls `choose` with the picked entry. */
  open(
    host: HTMLElement,
    opener: Element,
    title: string,
    choices: readonly LinkChoice[],
    choose: (choice: LinkChoice) => void,
  ): void {
    this.close(false);
    const items = choices.map((choice) => {
      const item = element("button", {
        className: "context-menu__item",
        text: choice.label,
        attributes: { type: "button", role: "menuitem" },
      });
      item.addEventListener("click", () => {
        this.close(true);
        choose(choice);
      });
      return item;
    });
    const box = opener.getBoundingClientRect();
    const menu = element(
      "div",
      {
        className: "context-menu diagram-link-menu",
        attributes: {
          role: "menu",
          "aria-label": title,
          style: `left: ${Math.round(box.left)}px; top: ${Math.round(box.bottom)}px`,
        },
      },
      items,
    );
    menu.addEventListener("keydown", (event) => this.onKey(event, items));
    this.menu = menu;
    this.opener = opener;
    host.append(menu);
    items[0]?.focus();
    document.addEventListener("pointerdown", this.onOutsideClick, true);
  }

  /** Closes the menu; the focus goes back to the port unless something else took it. */
  close(restoreFocus: boolean): void {
    this.menu?.remove();
    this.menu = null;
    document.removeEventListener("pointerdown", this.onOutsideClick, true);
    if (restoreFocus && this.opener instanceof SVGElement) {
      this.opener.focus();
    }
    this.opener = null;
  }

  private onKey(event: KeyboardEvent, items: readonly HTMLElement[]): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const active = document.activeElement;
      const at = active instanceof HTMLElement ? items.indexOf(active) : -1;
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      this.close(false);
    }
  }
}
