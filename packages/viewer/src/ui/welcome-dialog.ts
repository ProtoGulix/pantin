import { nextFocusIndex, welcomeTabForKey } from "../panel/welcome-model.ts";
import type { PanelView } from "../view-model.ts";
import type { WelcomeTab } from "../viewer-state.ts";
import { element } from "./dom.ts";
import { icon } from "./icons.ts";
import { renderMessageLine } from "./message-line.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { createPantinList } from "./pantin-list.ts";
import { createWelcomeHome } from "./welcome-home.ts";

// The welcome dialog (ADR 0027): a modal window centred over the empty 3D
// view while no Pantin is open. Escape and the close button hide it; focus
// stays inside while it is open. Its regions are built once and redrawn in
// place, so a click is never lost to a rebuild between press and release.

const TABS: readonly WelcomeTab[] = ["home", "all"];
const FOCUSABLE =
  "button:not([disabled]):not([tabindex='-1']), a[href], input:not([tabindex='-1']), [tabindex='0']";

export class WelcomeDialog {
  private readonly overlay: HTMLElement;
  private readonly title = element("h2", {
    className: "welcome__title",
    attributes: { id: "welcome-title" },
  });
  private readonly closeButton = element("button", {
    className: "icon-button",
    attributes: { type: "button" },
  });
  private readonly tabs = new Map<WelcomeTab, HTMLElement>();
  private readonly panels = new Map<WelcomeTab, HTMLElement>();
  private readonly home = createWelcomeHome();
  private readonly list = createPantinList();
  private readonly filter = element("input", {
    className: "text-input",
    attributes: { type: "search", spellcheck: "false", autocomplete: "off" },
  });
  private readonly emptyText = element("p", { className: "pane-empty" });
  private readonly messageHost = element("div", { className: "message-host" });
  private readonly dialog: HTMLElement;
  private intents: PanelIntents | null = null;
  private wasVisible = false;
  private readonly onHidden: (mode: PanelView["mode"]) => void;

  // onHidden: where focus goes when the dialog leaves (it was inside it).
  constructor(overlay: HTMLElement, onHidden: (mode: PanelView["mode"]) => void) {
    this.overlay = overlay;
    this.onHidden = onHidden;
    const tabList = element("div", { className: "welcome__tabs", attributes: { role: "tablist" } });
    for (const tab of TABS) {
      const button = element("button", {
        className: "welcome__tab",
        attributes: {
          type: "button",
          role: "tab",
          id: `welcome-tab-${tab}`,
          "aria-controls": `welcome-panel-${tab}`,
          "data-tab": tab,
        },
      });
      this.tabs.set(tab, button);
      tabList.append(button);
    }
    this.closeButton.append(icon("close"));
    this.dialog = element(
      "div",
      {
        className: "welcome",
        attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "welcome-title" },
      },
      [
        element("header", { className: "welcome__header" }, [this.title, this.closeButton]),
        tabList,
        this.panel("home", [this.home.element]),
        this.panel("all", [this.filter, this.list.element, this.emptyText]),
        this.messageHost,
      ],
    );
    overlay.replaceChildren(this.dialog);
    this.listen(tabList);
  }

  render(view: PanelView, intents: PanelIntents): void {
    this.intents = intents;
    const { welcome, translate } = view;
    this.overlay.hidden = !welcome.visible;
    this.title.textContent = translate("welcome.title");
    const closeLabel = translate("welcome.close");
    this.closeButton.setAttribute("aria-label", closeLabel);
    this.closeButton.title = closeLabel;
    for (const tab of TABS) {
      const selected = tab === welcome.tab;
      const button = this.tabs.get(tab);
      button?.setAttribute("aria-selected", String(selected));
      button?.setAttribute("tabindex", selected ? "0" : "-1");
      if (button !== undefined) {
        button.textContent = translate(tab === "home" ? "welcome.tab.home" : "welcome.tab.all");
      }
      const panel = this.panels.get(tab);
      panel?.toggleAttribute("hidden", !selected);
    }
    this.home.render(welcome, translate, intents);
    this.renderAll(view, intents);
    const message = renderMessageLine(view.message, translate, intents);
    this.messageHost.replaceChildren(...(message === null ? [] : [message]));
    if (welcome.visible && !this.wasVisible) {
      this.tabs.get(welcome.tab)?.focus();
    }
    if (!welcome.visible && this.wasVisible) {
      this.onHidden(view.mode);
    }
    this.wasVisible = welcome.visible;
  }

  private renderAll(view: PanelView, intents: PanelIntents): void {
    const { welcome, translate } = view;
    this.filter.setAttribute("aria-label", translate("welcome.filter.label"));
    this.filter.placeholder = translate("welcome.filter.label");
    if (this.filter.value !== welcome.filter) {
      this.filter.value = welcome.filter;
    }
    this.list.render(welcome.rows, translate, intents);
    this.list.element.hidden = welcome.rows.length === 0;
    this.emptyText.hidden = welcome.emptyText === null;
    this.emptyText.textContent = welcome.emptyText ?? "";
  }

  private panel(tab: WelcomeTab, children: HTMLElement[]): HTMLElement {
    const panel = element(
      "div",
      {
        className: `welcome__panel welcome__panel--${tab}`,
        attributes: {
          role: "tabpanel",
          id: `welcome-panel-${tab}`,
          "aria-labelledby": `welcome-tab-${tab}`,
        },
      },
      children,
    );
    this.panels.set(tab, panel);
    return panel;
  }

  private listen(tabList: HTMLElement): void {
    this.closeButton.addEventListener("click", () => this.intents?.hideWelcome());
    this.filter.addEventListener("input", () => this.intents?.setWelcomeFilter(this.filter.value));
    this.filter.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.list.element.focus();
      }
    });
    tabList.addEventListener("click", (event) => {
      const tab = event.target instanceof Element ? event.target.closest("[data-tab]") : null;
      const name = TABS.find((candidate) => candidate === tab?.getAttribute("data-tab"));
      if (name !== undefined) {
        this.intents?.selectWelcomeTab(name);
      }
    });
    tabList.addEventListener("keydown", (event) => {
      const current = TABS.find((tab) => this.tabs.get(tab) === document.activeElement);
      const next = current === undefined ? null : welcomeTabForKey(current, event.key);
      if (next !== null) {
        event.preventDefault();
        this.intents?.selectWelcomeTab(next);
        this.tabs.get(next)?.focus();
      }
    });
    // On the document, not the dialog: when focus is lost (a field that closed)
    // or strays to the menu bar, the keyboard must still be held by the modal.
    document.addEventListener("keydown", (event) => {
      if (!this.overlay.hidden && !event.defaultPrevented) {
        this.onKey(event);
      }
    });
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.intents?.hideWelcome();
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
