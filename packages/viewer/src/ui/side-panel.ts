import type { OpenPantinView, PanelView } from "../view-model.ts";
import { renderBodyList, scrollSelectedBodyIntoView } from "./body-list.ts";
import { button, committingTextInput, element } from "./dom.ts";
import { renderImportButton, renderImportForm } from "./import-form.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { renderPantinListSection } from "./pantin-list-section.ts";

// Renders the whole side panel from a PanelView. Rebuilding the DOM on each
// update keeps the component stateless; the panel is small enough for that.

function errorBanner(message: string | null, intents: PanelIntents): HTMLElement | null {
  if (message === null) {
    return null;
  }
  return element("div", { className: "error-banner", attributes: { role: "alert" } }, [
    element("span", { className: "error-banner__message", text: message }),
    button("Dismiss", "button button--ghost button--small", intents.dismissError),
  ]);
}

function pantinHeader(view: OpenPantinView, intents: PanelIntents): HTMLElement {
  const save = button("Save", "button button--primary", intents.savePantin);
  save.disabled = !view.saveEnabled;
  const status = view.hasUnsavedChanges
    ? element("span", { className: "status status--unsaved", text: "● Unsaved changes" })
    : element("span", { className: "status status--saved", text: "Saved" });
  return element("div", { className: "pantin-header" }, [
    committingTextInput(view.name, "Pantin name", intents.renamePantin),
    element("div", { className: "pantin-header__actions" }, [status, save]),
  ]);
}

function openPantinSection(panel: PanelView, intents: PanelIntents): HTMLElement {
  const view = panel.openPantin;
  if (view === null) {
    return element("section", { className: "panel-section" }, [
      element("p", {
        className: "empty-message",
        text: "Open or create a Pantin to see its bodies.",
      }),
    ]);
  }
  const importArea =
    panel.importForm === null
      ? renderImportButton(intents, panel.busy)
      : renderImportForm(panel.importForm, intents);
  const empty =
    view.emptyBodiesMessage === null
      ? null
      : element("p", { className: "empty-message", text: view.emptyBodiesMessage });
  return element("section", { className: "panel-section panel-section--grow" }, [
    element("h2", { className: "panel-section__title", text: `Pantin · ${view.id}` }),
    pantinHeader(view, intents),
    element("h3", { className: "panel-section__subtitle", text: "Bodies" }),
    importArea,
    empty,
    renderBodyList(view.bodies, intents),
  ]);
}

interface FocusSnapshot {
  label: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

// Text inputs are recognised across renders by their aria-label, which is
// unique in the panel; what the user was typing survives the rebuild.
function captureFocus(container: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement;
  const label = active?.getAttribute("aria-label");
  if (
    !(active instanceof HTMLInputElement) ||
    active.type !== "text" ||
    !container.contains(active) ||
    !label
  ) {
    return null;
  }
  return {
    label,
    value: active.value,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
  };
}

function restoreFocus(container: HTMLElement, snapshot: FocusSnapshot | null): void {
  if (snapshot === null) {
    return;
  }
  const input = [...container.querySelectorAll("input")].find(
    (candidate) =>
      candidate.type === "text" && candidate.getAttribute("aria-label") === snapshot.label,
  );
  if (input !== undefined) {
    input.value = snapshot.value;
    input.focus();
    input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}

export function renderSidePanel(
  container: HTMLElement,
  view: PanelView,
  intents: PanelIntents,
): void {
  const focus = captureFocus(container);
  container.replaceChildren(
    ...[
      element("header", { className: "brand" }, [
        element("span", { className: "brand__name", text: "Pantin" }),
        view.busy
          ? element("span", { className: "spinner", attributes: { "aria-label": "Working" } })
          : null,
      ]),
      errorBanner(view.errorMessage, intents),
      renderPantinListSection(view, intents),
      openPantinSection(view, intents),
    ].filter((child) => child !== null),
  );
  restoreFocus(container, focus);
  scrollSelectedBodyIntoView(container);
}
