import type { SymbolImportView } from "../io/symbol-import-view.ts";
import { nextFocusIndex } from "../panel/welcome-model.ts";
import { element } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { glyphThenText } from "./state-glyph.ts";
import { drawModuleProposals } from "./symbol-import-proposals.ts";
import { drawSymbolSection } from "./symbol-import-sections.ts";

// The PLC symbol import window of the I/O view (ADR 0064 point 14): a modal over the central
// area like the About window. Tab stays inside, Escape closes it without sending anything.
// It is redrawn only when its state changes, keeping the focus on the control in use.

const FOCUSABLE = "button:not([aria-disabled='true']), input:not(:disabled), select:not(:disabled)";

type Intents = PanelIntents;

function statusLine(view: SymbolImportView): HTMLElement | null {
  if (view.statusText === "") {
    return null;
  }
  const failed = view.status === "failed" || view.detail !== null;
  return element(
    "p",
    {
      className: `symbol-import__status${failed ? " is-failed" : ""}`,
      attributes: { role: failed ? "alert" : "status" },
    },
    failed ? glyphThenText("warning", view.statusText) : [document.createTextNode(view.statusText)],
  );
}

function body(view: SymbolImportView, intents: Intents): HTMLElement {
  const skipped =
    view.skippedLines.length === 0
      ? []
      : [
          element("h3", { className: "symbol-section__heading", text: view.skippedHeading }),
          element(
            "ul",
            { className: "symbol-section__rows" },
            view.skippedLines.map((line) => element("li", { className: "symbol-row", text: line })),
          ),
        ];
  return element("div", { className: "symbol-import__body" }, [
    element("p", { className: "symbol-import__file", text: view.fileLine }),
    statusLine(view),
    view.detail === null
      ? null
      : element("p", { className: "symbol-import__detail", text: view.detail }),
    ...view.infoLines.map((line) => element("p", { className: "symbol-import__info", text: line })),
    view.moduleProposals === null ? null : drawModuleProposals(view.moduleProposals, intents),
    ...view.sections.map((section) => drawSymbolSection(section, intents)),
    ...skipped,
  ]);
}

function footer(view: SymbolImportView, intents: Intents): HTMLElement {
  const cancel = element("button", {
    className: "io-button",
    text: view.cancelLabel,
    attributes: { type: "button", "data-focus-key": "cancel" },
  });
  cancel.addEventListener("click", () => intents.closeSymbolImport());
  const apply = element("button", {
    className: "io-button symbol-import__apply",
    text: view.applyLabel,
    attributes: {
      type: "button",
      "aria-disabled": String(!view.applyEnabled),
      "data-focus-key": "apply",
    },
  });
  apply.addEventListener("click", () => {
    if (view.applyEnabled) {
      intents.applySymbolImport();
    }
  });
  const hasChoices = view.status === "ready";
  return element("footer", { className: "symbol-import__footer" }, [
    hasChoices
      ? element("span", { className: "symbol-import__summary", text: view.summary })
      : null,
    cancel,
    hasChoices ? apply : null,
  ]);
}

export class SymbolImportDialog {
  private readonly overlay: HTMLElement;
  private readonly dialog = element("div", {
    className: "welcome symbol-import",
    attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "symbol-import-title" },
  });
  private intents: Intents | null = null;
  private shown: SymbolImportView["source"] | null = null;
  private shownTitle = "";
  private returnFocusTo: Element | null = null;

  constructor(overlay: HTMLElement) {
    this.overlay = overlay;
    overlay.replaceChildren(this.dialog);
    document.addEventListener("keydown", (event) => this.onKey(event), true);
  }

  render(view: SymbolImportView, intents: Intents): void {
    this.intents = intents;
    if (!view.visible) {
      this.hide();
      return;
    }
    const opening = this.overlay.hidden;
    if (opening) {
      this.returnFocusTo = document.activeElement;
      this.overlay.hidden = false;
    }
    if (opening || view.source !== this.shown || view.title !== this.shownTitle) {
      this.draw(view, intents);
      this.shown = view.source;
      this.shownTitle = view.title;
    }
  }

  private draw(view: SymbolImportView, intents: Intents): void {
    const snapshot = captureFocus(this.dialog);
    const close = element(
      "button",
      {
        className: "icon-button",
        attributes: { type: "button", "aria-label": view.closeLabel, title: view.closeLabel },
      },
      [icon("close")],
    );
    close.addEventListener("click", () => intents.closeSymbolImport());
    this.dialog.replaceChildren(
      element("header", { className: "welcome__header" }, [
        element("h2", {
          className: "welcome__title",
          text: view.title,
          attributes: { id: "symbol-import-title" },
        }),
        close,
      ]),
      body(view, intents),
      footer(view, intents),
    );
    restoreFocus(this.dialog, snapshot);
    if (!this.dialog.contains(document.activeElement)) {
      this.dialog.querySelector<HTMLElement>("[data-focus-key='cancel']")?.focus();
    }
  }

  private hide(): void {
    if (this.overlay.hidden) {
      return;
    }
    this.overlay.hidden = true;
    this.shown = null;
    // The I/O panel redraws after an apply, which detaches the button that opened the window.
    const opener =
      this.returnFocusTo instanceof HTMLElement && this.returnFocusTo.isConnected
        ? this.returnFocusTo
        : document.querySelector<HTMLElement>("[data-focus-key='io-import-symbols']");
    opener?.focus();
    this.returnFocusTo = null;
  }

  private onKey(event: KeyboardEvent): void {
    if (this.overlay.hidden) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.intents?.closeSymbolImport();
    } else if (event.key === "Tab") {
      const controls = [...this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
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
