import { isScrolledToBottom } from "../console/console-scroll.ts";
import type { ConsoleLineView, ConsoleView } from "../console/console-view.ts";
import type { Translate } from "../i18n/translate.ts";
import { CONSOLE_HEIGHT_DEFAULT, clampConsoleHeight, parseStoredNumber } from "../layout-sizes.ts";
import { listCommandForKey } from "../panel/list-navigation.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./browser-storage.ts";
import { showConsoleCounter } from "./console-counter.ts";
import { unhandledKeyInDiagram } from "./diagram-key-policy.ts";
import { element, iconButton } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { isEditable } from "./shortcuts.ts";
import { createSplitter } from "./splitter.ts";

// The Pantin console (ADR 0031 point 5): a panel under the 3D view and the
// diagram, with its own splitter. Redrawn only when what it shows changed, as
// the panel is rendered on every store update; the list keeps its scroll
// unless the user was at the bottom, and the focus stays on the same line.

function filterButtons(view: ConsoleView, t: Translate, intents: PanelIntents): HTMLElement {
  const buttons = view.filters.map((filter) => {
    const created = element("button", {
      className: `console__filter console__filter--${filter.level}${filter.pressed ? " is-pressed" : ""}`,
      attributes: {
        type: "button",
        "aria-pressed": String(filter.pressed),
        "data-focus-key": `console-filter-${filter.level}`,
      },
    });
    created.append(icon(filter.level === "info" ? "info" : filter.level), filter.label);
    created.addEventListener("click", () => intents.toggleConsoleLevel(filter.level));
    return created;
  });
  return element(
    "div",
    {
      className: "console__filters",
      attributes: { role: "group", "aria-label": t("console.filters") },
    },
    buttons,
  );
}

function head(view: ConsoleView, t: Translate, intents: PanelIntents): HTMLElement {
  const clear = element("button", {
    className: "button",
    text: t("console.clear"),
    attributes: {
      type: "button",
      title: t("console.clearHint"),
      "data-focus-key": "console-clear",
    },
  });
  clear.disabled = !view.canClear;
  clear.addEventListener("click", () => intents.clearConsole());
  return element("div", { className: "console__head" }, [
    element("h2", { className: "console__title", text: t("console.title") }),
    filterButtons(view, t, intents),
    element("span", { className: "toolbar__spacer" }),
    clear,
    iconButton("close", t("console.close"), intents.toggleConsole),
  ]);
}

function lineElement(line: ConsoleLineView, intents: PanelIntents): HTMLElement {
  const created = element(
    "div",
    {
      className: `console-line console-line--${line.level}${line.activatable ? " is-activatable" : ""}`,
      attributes: {
        role: "listitem",
        tabindex: "-1",
        title: line.title,
        "data-line-key": line.key,
      },
    },
    [
      element("span", { className: "console-line__time", text: line.time }),
      element("span", { className: "console-line__level" }, [
        icon(line.level === "info" ? "info" : line.level),
      ]),
      element("span", { className: "console-line__level-text", text: line.levelLabel }),
      element("span", { className: "console-line__source", text: line.sourceLabel }),
      element("span", { className: "console-line__text", text: line.text }),
      line.detail === null
        ? null
        : element("code", { className: "console-line__detail", text: line.detail }),
      line.repeat === null
        ? null
        : element("span", { className: "console-line__repeat", text: line.repeat }),
    ],
  );
  if (line.activatable) {
    created.addEventListener("click", () => intents.selectConsoleSource(line.source));
  }
  return created;
}

// What the list did not handle must not reach the window's Delete and F2: they
// would act on the selection, which Enter on a line has just set, not on what
// the focus is on (diagram-key-policy.ts). Text fields keep their own keys.
function guardWindowShortcuts(event: KeyboardEvent): void {
  const { key, ctrlKey, metaKey, altKey } = event;
  const press = { key, ctrlKey, metaKey, altKey, inEditableField: isEditable(event.target) };
  if (!event.defaultPrevented && unhandledKeyInDiagram(press) !== "pass") {
    event.preventDefault();
  }
}

export class ConsolePanel {
  private readonly host: HTMLElement;
  private readonly area: HTMLElement;
  private readonly splitter: HTMLElement;
  private readonly counterButton: () => HTMLElement | null;
  private readonly headHost = element("div");
  private readonly list = element("div", {
    className: "console__list",
    attributes: { role: "list", tabindex: "-1" },
  });
  private height = parseStoredNumber(
    readStoredText(STORAGE_KEYS.consoleHeight),
    CONSOLE_HEIGHT_DEFAULT,
  );
  private startHeight = this.height;
  private shownSignature = "";
  private lines: readonly ConsoleLineView[] = [];
  private intents: PanelIntents | null = null;
  private translate: Translate | null = null;
  // The line that takes the tab stop: the one last focused, else the newest.
  private focusedKey: string | null = null;

  // `area` is the column holding the central view and the console: its height
  // bounds the console's.
  // `counterButton` is the toolbar counter: it takes the focus back when the panel closes
  // under it, and is updated with the lines.
  constructor(host: HTMLElement, area: HTMLElement, counterButton: () => HTMLElement | null) {
    this.counterButton = counterButton;
    this.host = host;
    this.area = area;
    this.splitter = createSplitter({
      orientation: "horizontal",
      onStart: () => {
        this.startHeight = clampConsoleHeight(this.height, this.area.clientHeight);
      },
      // The splitter is the console's top edge: moving up makes it taller.
      onMove: (delta) => this.setHeight(this.startHeight - delta),
      onEnd: () => writeStoredText(STORAGE_KEYS.consoleHeight, String(this.height)),
      onReset: () => {
        this.setHeight(CONSOLE_HEIGHT_DEFAULT);
        writeStoredText(STORAGE_KEYS.consoleHeight, String(this.height));
      },
    });
    this.splitter.classList.add("console__splitter");
    host.replaceChildren(this.splitter, this.headHost, this.list);
    this.list.addEventListener("keydown", (event) => this.onKey(event));
    host.addEventListener("keydown", (event) => guardWindowShortcuts(event));
    this.list.addEventListener("focusin", (event) => this.onFocusIn(event));
    new ResizeObserver(() => this.applyHeight()).observe(area);
  }

  /** New lines between two redraws of the viewer: the panel and the counter, in place. */
  showLive(view: ConsoleView | null): void {
    if (this.translate !== null && this.intents !== null) {
      this.render(view, this.translate, this.intents);
      const counter = this.counterButton();
      if (counter !== null && view !== null) {
        showConsoleCounter(counter, view);
      }
    }
  }

  render(view: ConsoleView | null, t: Translate, intents: PanelIntents): void {
    this.intents = intents;
    this.translate = t;
    const hadFocus = this.host.contains(document.activeElement);
    this.host.hidden = view?.open !== true;
    this.splitter.setAttribute("aria-label", t("splitter.console"));
    this.splitter.title = t("splitter.console");
    this.host.setAttribute("aria-label", t("console.title"));
    if (view === null || !view.open) {
      // Hidden elements drop the focus to the page: give it back to the counter.
      if (hadFocus) {
        this.counterButton()?.focus();
      }
      return;
    }
    const signature = JSON.stringify(view);
    if (signature !== this.shownSignature) {
      this.shownSignature = signature;
      this.draw(view, t, intents);
    }
    this.applyHeight();
  }

  private draw(view: ConsoleView, t: Translate, intents: PanelIntents): void {
    const focus = captureFocus(this.host);
    const hadFocus = this.host.contains(document.activeElement);
    const keepsFocus = this.list.contains(document.activeElement);
    const wasAtBottom = isScrolledToBottom(
      this.list.scrollTop,
      this.list.clientHeight,
      this.list.scrollHeight,
    );
    const scrollTop = this.list.scrollTop;
    this.lines = view.lines;
    this.headHost.replaceChildren(head(view, t, intents));
    this.list.setAttribute("aria-label", t("console.list"));
    this.list.replaceChildren(
      ...(view.emptyText === null
        ? view.lines.map((line) => lineElement(line, intents))
        : [element("p", { className: "console__empty", text: view.emptyText })]),
    );
    this.list.scrollTop = wasAtBottom ? this.list.scrollHeight : scrollTop;
    restoreFocus(this.host, focus);
    // "Effacer" disables itself once it has cleared: focus must not fall to the page.
    if (hadFocus && !this.host.contains(document.activeElement)) {
      this.list.focus();
    }
    this.placeTabStop(keepsFocus);
  }

  private lineElements(): HTMLElement[] {
    return [...this.list.querySelectorAll<HTMLElement>(".console-line")];
  }

  private placeTabStop(restoreFocusToLine: boolean): void {
    const lines = this.lineElements();
    const stop =
      lines.find((line) => line.dataset.lineKey === this.focusedKey) ?? lines[lines.length - 1];
    if (stop !== undefined) {
      stop.tabIndex = 0;
      if (restoreFocusToLine && stop.dataset.lineKey === this.focusedKey) {
        stop.focus({ preventScroll: true });
      }
    }
  }

  private onFocusIn(event: FocusEvent): void {
    const line =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>(".console-line")
        : null;
    if (line !== null) {
      this.focusedKey = line.dataset.lineKey ?? null;
      for (const other of this.lineElements()) {
        other.tabIndex = other === line ? 0 : -1;
      }
    }
  }

  // Arrows, Home and End move between lines, Enter selects the source: the
  // list navigation of the Pantin list, with a line key for an id.
  private onKey(event: KeyboardEvent): void {
    const command = listCommandForKey(
      this.lines.map((line) => line.key),
      this.focusedKey,
      event.key,
    );
    if (command.type === "none") {
      return;
    }
    event.preventDefault();
    if (command.type === "select") {
      this.lineElements()
        .find((line) => line.dataset.lineKey === command.id)
        ?.focus();
    } else {
      const line = this.lines.find((candidate) => candidate.key === command.id);
      if (line?.activatable) {
        this.intents?.selectConsoleSource(line.source);
      }
    }
  }

  private setHeight(height: number): void {
    this.height = clampConsoleHeight(height, this.area.clientHeight);
    this.applyHeight();
  }

  private applyHeight(): void {
    const shown = clampConsoleHeight(this.height, this.area.clientHeight);
    this.host.style.height = `${shown}px`;
    this.splitter.setAttribute("aria-valuenow", String(shown));
  }
}
