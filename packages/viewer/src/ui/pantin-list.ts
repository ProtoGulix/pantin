import type { Translate } from "../i18n/translate.ts";
import { listCommandForKey } from "../panel/list-navigation.ts";
import type { PantinListRowView } from "../view-model.ts";
import { element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The list view (role=listbox): every Pantin with its id and body count.
// Built once and fed by delegation, like the tree, so redraws never lose a
// click; a double-click, Enter or the Open button opens a Pantin.

export interface PantinList {
  element: HTMLElement;
  listbox: HTMLElement;
  render(rows: readonly PantinListRowView[], translate: Translate, intents: PanelIntents): void;
}

interface Current {
  rows: readonly PantinListRowView[];
  intents: PanelIntents | null;
}

function rowElement(row: PantinListRowView, index: number, translate: Translate): HTMLElement {
  // Handled by delegation on the listbox; out of the tab order, since the
  // listbox itself takes the keyboard (Enter opens).
  const open = element("button", {
    className: "button list-row__open",
    text: translate("list.open"),
    attributes: { type: "button", tabindex: "-1", "data-action": "open" },
  });
  return element(
    "div",
    {
      className: row.selected ? "list-row list-row--selected" : "list-row",
      attributes: {
        role: "option",
        id: `pantin-option-${index}`,
        "data-pantin-id": row.id,
        "aria-selected": String(row.selected),
      },
    },
    [
      icon("pantin", "icon list-row__icon"),
      element("span", { className: "list-row__name", text: row.name }),
      element("span", { className: "list-row__detail", text: row.detail }),
      open,
    ],
  );
}

function pantinIdOf(event: Event): string | null {
  const target = event.target;
  return target instanceof Element
    ? (target.closest("[role=option]")?.getAttribute("data-pantin-id") ?? null)
    : null;
}

function isOpenButton(event: Event): boolean {
  return event.target instanceof Element && event.target.closest("[data-action=open]") !== null;
}

function listen(listbox: HTMLElement, current: Current): void {
  listbox.addEventListener("pointerdown", (event) => {
    const pantinId = pantinIdOf(event);
    if (pantinId !== null) {
      current.intents?.selectListPantin(pantinId);
    }
  });
  listbox.addEventListener("click", (event) => {
    const pantinId = pantinIdOf(event);
    if (pantinId !== null && isOpenButton(event)) {
      current.intents?.openPantin(pantinId);
    }
  });
  listbox.addEventListener("dblclick", (event) => {
    const pantinId = pantinIdOf(event);
    if (pantinId !== null && !isOpenButton(event)) {
      current.intents?.openPantin(pantinId);
    }
  });
  listbox.addEventListener("keydown", (event) => {
    const ids = current.rows.map((row) => row.id);
    const selected = current.rows.find((row) => row.selected)?.id ?? null;
    const command = listCommandForKey(ids, selected, event.key);
    if (command.type !== "none") {
      event.preventDefault();
      const act =
        command.type === "open" ? current.intents?.openPantin : current.intents?.selectListPantin;
      act?.(command.pantinId);
    }
  });
}

export function createPantinList(): PantinList {
  const listbox = element("div", {
    className: "pantin-list",
    attributes: { role: "listbox", tabindex: "0" },
  });
  const emptyMessage = element("p", { className: "pane-empty" });
  const title = element("h2", { className: "pane__title" });
  const container = element("section", { className: "pane pane--list" }, [
    title,
    emptyMessage,
    listbox,
  ]);
  const current: Current = { rows: [], intents: null };
  listen(listbox, current);
  return {
    element: container,
    listbox,
    render: (rows, translate, intents) => {
      current.rows = rows;
      current.intents = intents;
      title.textContent = translate("list.title");
      listbox.setAttribute("aria-label", translate("list.label"));
      listbox.replaceChildren(...rows.map((row, index) => rowElement(row, index, translate)));
      emptyMessage.textContent = translate("list.empty");
      emptyMessage.hidden = rows.length > 0;
      const selectedIndex = rows.findIndex((row) => row.selected);
      listbox.toggleAttribute("aria-activedescendant", selectedIndex >= 0);
      if (selectedIndex >= 0) {
        listbox.setAttribute("aria-activedescendant", `pantin-option-${selectedIndex}`);
        listbox.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
      }
    },
  };
}
