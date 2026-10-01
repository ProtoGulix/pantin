import type { ConsoleView } from "../console/console-view.ts";
import { element } from "./dom.ts";
import { icon } from "./icons.ts";

// The toolbar's counter of console errors and warnings (ADR 0031 point 5). The
// button is drawn with the toolbar, and its numbers are rewritten in place when
// new lines come, which is several times a second while a source flickers.

const COUNTER_CLASS = "console-counter";

function countClass(kind: "errors" | "warnings", count: number): string {
  return `console-counter__count console-counter__count--${kind}${count > 0 ? " is-active" : ""}`;
}

function applyCounter(button: HTMLElement, view: ConsoleView): void {
  const { counter, open } = view;
  button.title = counter.label;
  button.setAttribute("aria-label", counter.label);
  button.setAttribute("aria-pressed", String(open));
  button.classList.toggle("is-pressed", open);
  for (const kind of ["errors", "warnings"] as const) {
    const count = button.querySelector<HTMLElement>(`.console-counter__count--${kind}`);
    if (count !== null) {
      count.className = countClass(kind, counter[kind]);
      count.textContent = String(counter[kind]);
    }
  }
}

/** Rewrites the numbers and labels of the counter button, without redrawing it. */
export function showConsoleCounter(button: HTMLElement, view: ConsoleView): void {
  applyCounter(button, view);
}

export function createConsoleCounter(view: ConsoleView, onClick: () => void): HTMLElement {
  const created = element("button", { className: COUNTER_CLASS, attributes: { type: "button" } }, [
    icon("error"),
    element("span", { className: countClass("errors", 0) }),
    icon("warning"),
    element("span", { className: countClass("warnings", 0) }),
  ]);
  applyCounter(created, view);
  created.addEventListener("click", onClick);
  return created;
}
