import type { DrawnDiagram } from "./diagram-draw.ts";

// One tab stop for the whole diagram (roving tabindex): nodes, ports and links
// number in the hundreds, so Tab enters and leaves it, and the arrow keys move
// inside (diagram-keys.ts). The focused item is remembered across redraws,
// which happen after every edit, so that the keyboard user does not lose their place.

const isBand = (key: string) => key.startsWith("band:");

export class RovingFocus {
  // The tab stop among nodes, ports and links, and the last item focused of any kind.
  private current: string | null = null;
  private last: string | null = null;
  private drawn: DrawnDiagram | null = null;

  /** True while the keyboard focus is somewhere in the diagram. */
  holdsFocus(svg: Element | null): boolean {
    const active = document.activeElement;
    return svg !== null && active !== null && svg.contains(active);
  }

  /** A new drawing: the remembered item (or the first node) becomes the tab stop. */
  attach(drawn: DrawnDiagram, firstKey: string | null, restoreFocus: boolean): void {
    this.drawn = drawn;
    const stop =
      this.current !== null && drawn.focusables.has(this.current) ? this.current : firstKey;
    this.current = stop;
    this.setTabStop(stop, 0);
    const back = this.last !== null && drawn.focusables.has(this.last) ? this.last : stop;
    if (restoreFocus && back !== null) {
      drawn.focusables.get(back)?.focus({ preventScroll: true });
    }
    drawn.svg.addEventListener("focusin", (event) => this.onFocusIn(event));
  }

  /** Moves the focus to an item and scrolls it into view. */
  focus(key: string): void {
    const item = this.drawn?.focusables.get(key);
    if (item !== undefined) {
      item.focus({ preventScroll: true });
      item.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  private onFocusIn(event: FocusEvent): void {
    const target = event.target instanceof Element ? event.target.closest("[data-focus]") : null;
    const key = target?.getAttribute("data-focus") ?? null;
    this.last = key ?? this.last;
    if (key !== null && !isBand(key) && key !== this.current) {
      this.setTabStop(this.current, -1);
      this.current = key;
      this.setTabStop(key, 0);
    }
  }

  // Bands keep their own tab stop: they are few, and folding is a frequent gesture.
  private setTabStop(key: string | null, index: 0 | -1): void {
    if (key !== null && !isBand(key)) {
      this.drawn?.focusables.get(key)?.setAttribute("tabindex", String(index));
    }
  }
}
