import type { PanelView, PantinListRowView } from "../view-model.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

function pantinRow(row: PantinListRowView, intents: PanelIntents, busy: boolean): HTMLLIElement {
  const openButton = element(
    "button",
    {
      className: row.isOpen ? "list-row list-row--active" : "list-row",
      attributes: { type: "button", "aria-current": row.isOpen ? "true" : "false" },
    },
    [
      element("span", { className: "list-row__title", text: row.name }),
      element("span", { className: "list-row__meta", text: `${row.id} · ${row.bodyCountLabel}` }),
    ],
  );
  openButton.disabled = busy;
  openButton.addEventListener("click", () => intents.openPantin(row.id));
  return element("li", {}, [openButton]);
}

function createForm(intents: PanelIntents, busy: boolean): HTMLFormElement {
  const nameInput = element("input", {
    className: "text-input",
    attributes: { type: "text", placeholder: "New Pantin name", "aria-label": "New Pantin name" },
  });
  const submit = element("button", {
    className: "button button--primary",
    text: "Create",
    attributes: { type: "submit" },
  });
  submit.disabled = busy;
  const form = element("form", { className: "inline-form" }, [nameInput, submit]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    intents.createPantin(nameInput.value);
  });
  return form;
}

export function renderPantinListSection(view: PanelView, intents: PanelIntents): HTMLElement {
  const list = element(
    "ul",
    { className: "pantin-list" },
    view.pantins.map((row) => pantinRow(row, intents, view.busy)),
  );
  const empty =
    view.emptyListMessage === null
      ? null
      : element("p", { className: "empty-message", text: view.emptyListMessage });
  return element("section", { className: "panel-section" }, [
    element("h2", { className: "panel-section__title", text: "Pantins" }),
    empty,
    list,
    createForm(intents, view.busy),
  ]);
}
