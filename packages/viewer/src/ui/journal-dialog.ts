import {
  JOURNAL_LEVELS,
  type JournalEntryView,
  type JournalFilterView,
  type JournalView,
  scrollTopAfterRefresh,
} from "../bridge/bridge-journal.ts";
import type { JournalLevel } from "../bridge/bridge-log-parser.ts";
import { nextFocusIndex } from "../panel/welcome-model.ts";
import { glyphOfLevel } from "../theme/state-glyphs.ts";
import { element } from "./dom.ts";
import { type IconName, icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The bridge log window (ADR 0054 point 5), a modal over the central area like the
// welcome dialog, written in place when its view changes so that a refresh
// never loses the reader's scroll position or selection. Escape closes it.

const FOCUSABLE = "button:not([disabled]), a[href], [tabindex='0']";
const FEEDBACK_MILLISECONDS = 1500;

// An entry with no source (a line found before any entry) keeps an empty cell.
function badge(kind: string, value: string, label: string, glyph?: IconName): HTMLElement {
  const created = element("span", {
    className: label === "" ? "" : `journal__badge journal__badge--${kind}-${value}`,
  });
  if (glyph !== undefined) {
    created.append(icon(glyph, "icon icon--small"));
  }
  created.append(label);
  return created;
}

// The level and the source are words in a badge: colour is never the only cue.
function entryItem(entry: JournalEntryView): HTMLElement {
  const message = element("div", { className: "journal__message", text: entry.message });
  if (entry.logger !== null) {
    message.title = entry.logger;
  }
  const continuation = entry.continuation.map((text) =>
    element("div", { className: "journal__continuation", text }),
  );
  return element("li", { className: `journal__entry journal__entry--${entry.level}` }, [
    element("span", {
      className: "journal__time",
      text: entry.time,
      attributes: { title: entry.timeTitle },
    }),
    badge("source", entry.source ?? "", entry.sourceLabel),
    badge("level", entry.level, entry.levelLabel, glyphOfLevel(entry.level)),
    element("div", { className: "journal__body" }, [message, ...continuation]),
  ]);
}

export class JournalDialog {
  private readonly overlay: HTMLElement;
  private readonly title = element("h2", { className: "welcome__title" });
  private readonly closeButton = element("button", {
    className: "icon-button",
    attributes: { type: "button" },
  });
  private readonly copyButton = element("button", {
    className: "button",
    attributes: { type: "button" },
  });
  private readonly downloadLink = element("a", { className: "button" });
  private readonly errorLine = element("p", {
    className: "journal__error",
    attributes: { role: "alert" },
  });
  private readonly truncatedLine = element("p", { className: "journal__note" });
  private readonly placeholder = element("p", { className: "pane-empty" });
  private readonly filterGroup = element("div", {
    className: "console__filters journal__filters",
    attributes: { role: "group" },
  });
  private readonly filterButtons = new Map<JournalLevel, HTMLButtonElement>();
  private readonly lines = element("ol", {
    className: "journal__lines",
    attributes: { tabindex: "0" },
  });
  private readonly dialog: HTMLElement;
  private intents: PanelIntents | null = null;
  private shownKey: string | null = null;
  private copyView: JournalView | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private returnFocusTo: Element | null = null;

  constructor(overlay: HTMLElement) {
    this.overlay = overlay;
    this.closeButton.append(icon("close"));
    this.filterGroup.append(...JOURNAL_LEVELS.map((level) => this.createFilterButton(level)));
    this.dialog = element(
      "div",
      { className: "welcome journal", attributes: { role: "dialog", "aria-modal": "true" } },
      [
        element("header", { className: "welcome__header" }, [this.title, this.closeButton]),
        this.filterGroup,
        this.errorLine,
        this.truncatedLine,
        this.placeholder,
        this.lines,
        element("footer", { className: "journal__footer" }, [this.copyButton, this.downloadLink]),
      ],
    );
    overlay.replaceChildren(this.dialog);
    this.listen();
  }

  render(view: JournalView | null, intents: PanelIntents): void {
    this.intents = intents;
    if (view === null) {
      this.hide();
      return;
    }
    const key = view.redrawKey;
    if (this.overlay.hidden) {
      this.returnFocusTo = document.activeElement;
      this.overlay.hidden = false;
      this.lines.focus();
    }
    this.copyView = view;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.draw(view);
    }
  }

  private hide(): void {
    if (this.overlay.hidden) {
      return;
    }
    this.overlay.hidden = true;
    this.shownKey = null;
    if (this.returnFocusTo instanceof HTMLElement) {
      this.returnFocusTo.focus();
    }
    this.returnFocusTo = null;
  }

  private draw(view: JournalView): void {
    this.title.textContent = view.title;
    this.dialog.setAttribute("aria-label", view.title);
    this.closeButton.setAttribute("aria-label", view.closeLabel);
    this.closeButton.title = view.closeLabel;
    this.lines.setAttribute("aria-label", view.linesLabel);
    this.filterGroup.setAttribute("aria-label", view.filtersLabel);
    this.drawFilters(view.filters);
    this.setText(this.errorLine, view.errorText);
    this.setText(this.truncatedLine, view.truncatedText);
    this.setText(this.placeholder, view.placeholder);
    this.copyButton.textContent = view.copyLabel;
    this.downloadLink.textContent = view.downloadLabel;
    this.downloadLink.href = view.downloadUrl;
    this.drawEntries(view.entries);
  }

  // The buttons are made once and only updated: a click must not lose its focus.
  private createFilterButton(level: JournalLevel): HTMLButtonElement {
    const created = element("button", {
      className: `console__filter console__filter--${level}`,
      attributes: { type: "button" },
    });
    created.addEventListener("click", () => this.intents?.toggleBridgeJournalLevel(level));
    this.filterButtons.set(level, created);
    return created;
  }

  private drawFilters(filters: readonly JournalFilterView[]): void {
    for (const filter of filters) {
      const created = this.filterButtons.get(filter.level);
      created?.classList.toggle("is-pressed", filter.pressed);
      created?.setAttribute("aria-pressed", String(filter.pressed));
      created?.replaceChildren(icon(filter.level), `${filter.label} ${filter.count}`);
    }
  }

  private setText(target: HTMLElement, text: string | null): void {
    target.hidden = text === null;
    target.textContent = text ?? "";
  }

  // Before the replacement the reader's position is measured: at the end they
  // follow the new lines, scrolled up they stay where they are.
  private drawEntries(entries: readonly JournalEntryView[]): void {
    const before = this.lines.childElementCount === 0 ? null : this.metrics();
    this.lines.replaceChildren(...entries.map(entryItem));
    this.lines.hidden = entries.length === 0;
    this.lines.scrollTop = scrollTopAfterRefresh(
      before,
      this.lines.scrollHeight,
      this.lines.clientHeight,
    );
  }

  private metrics() {
    const { scrollTop, clientHeight, scrollHeight } = this.lines;
    return { scrollTop, clientHeight, scrollHeight };
  }

  private async copy(): Promise<void> {
    const view = this.copyView;
    if (view === null) {
      return;
    }
    let label = view.copiedLabel;
    try {
      await navigator.clipboard.writeText(view.copyText);
    } catch {
      // Refused (no permission, insecure page): said on the button, the Download still works.
      label = view.copyFailedLabel;
    }
    this.copyButton.textContent = label;
    if (this.feedbackTimer !== null) {
      clearTimeout(this.feedbackTimer);
    }
    this.feedbackTimer = setTimeout(() => {
      this.feedbackTimer = null;
      this.copyButton.textContent = this.copyView?.copyLabel ?? "";
    }, FEEDBACK_MILLISECONDS);
  }

  private listen(): void {
    this.closeButton.addEventListener("click", () => this.intents?.closeBridgeJournal());
    this.copyButton.addEventListener("click", () => void this.copy());
    // On the document: when focus is lost the keyboard must still be held by the modal.
    document.addEventListener("keydown", (event) => {
      if (!this.overlay.hidden && !event.defaultPrevented) {
        this.onKey(event);
      }
    });
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.intents?.closeBridgeJournal();
    } else if (event.key === "Tab") {
      const controls = [...this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (control) => control.closest("[hidden]") === null,
      );
      const active = document.activeElement;
      const index = nextFocusIndex(
        controls.length,
        active instanceof HTMLElement ? controls.indexOf(active) : -1,
        event.shiftKey,
      );
      event.preventDefault();
      controls[index]?.focus();
    }
  }
}
