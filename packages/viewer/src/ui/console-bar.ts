import type { ConsoleView } from "../console/console-view.ts";
import { createConsoleCounter, showConsoleCounter } from "./console-counter.ts";

// The thin bar under the central area that holds the console counter (ADR 0031
// point 5 as amended on 2026-10-18). It lives outside the toolbar so that the
// error and warning glyphs never share a row with the brand-coloured view
// switch (ADR 0057 rule 5). The counter is created once and rewritten in place,
// as lines come often; it keeps the first `onToggle`, which only calls the
// screen's intents, the same object for the whole session.

export class ConsoleBar {
  private readonly host: HTMLElement;
  private counter: HTMLElement | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  /** Shows the counter for `view`, or hides the bar when there is no console. */
  show(view: ConsoleView | null, onToggle: () => void): void {
    this.host.hidden = view === null;
    if (view === null) {
      return;
    }
    if (this.counter === null) {
      this.counter = createConsoleCounter(view, onToggle);
      this.host.replaceChildren(this.counter);
    } else {
      showConsoleCounter(this.counter, view);
    }
  }

  focusCounter(): void {
    this.counter?.focus();
  }
}
