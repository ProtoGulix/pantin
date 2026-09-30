import type { Translate } from "../i18n/translate.ts";
import { listCommandForKey } from "../panel/list-navigation.ts";
import type { PantinListRowView } from "../panel/welcome-model.ts";
import { element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The "All Pantins" list (role=listbox): each Pantin with its id, body count and date.
// Built once and fed by delegation, like the tree; a double-click, Enter or
// the Open button opens a Pantin. A row is kept across redraws and only its
// selection updated: pressing Open selects the row, and a row rebuilt
// between the press and the release would lose the click.

export interface PantinList {
  element: HTMLElement;
  render(rows: readonly PantinListRowView[], translate: Translate, intents: PanelIntents): void;
}

interface Current {
  rows: readonly PantinListRowView[];
  intents: PanelIntents | null;
  // Row elements by what they show but their selection.
  elements: Map<string, HTMLElement>;
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
      className: "list-row",
      attributes: {
        role: "option",
        id: `pantin-option-${index}`,
        "data-pantin-id": row.id,
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

function contentSignature(row: PantinListRowView, index: number, openLabel: string): string {
  return JSON.stringify([row.id, row.name, row.detail, index, openLabel]);
}

function updateRows(listbox: HTMLElement, current: Current, translate: Translate): void {
  const openLabel = translate("list.open");
  const elements = new Map<string, HTMLElement>();
  const ordered = current.rows.map((row, index) => {
    const signature = contentSignature(row, index, openLabel);
    const kept = current.elements.get(signature) ?? rowElement(row, index, translate);
    kept.classList.toggle("list-row--selected", row.selected);
    kept.setAttribute("aria-selected", String(row.selected));
    elements.set(signature, kept);
    return kept;
  });
  current.elements = elements;
  const unchanged =
    ordered.length === listbox.children.length &&
    ordered.every((row, index) => listbox.children[index] === row);
  if (!unchanged) {
    listbox.replaceChildren(...ordered);
  }
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
  const current: Current = { rows: [], intents: null, elements: new Map() };
  listen(listbox, current);
  return {
    element: listbox,
    render: (rows, translate, intents) => {
      current.rows = rows;
      current.intents = intents;
      listbox.setAttribute("aria-label", translate("list.label"));
      updateRows(listbox, current, translate);
      const selectedIndex = rows.findIndex((row) => row.selected);
      listbox.toggleAttribute("aria-activedescendant", selectedIndex >= 0);
      if (selectedIndex >= 0) {
        listbox.setAttribute("aria-activedescendant", `pantin-option-${selectedIndex}`);
        listbox.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
      }
    },
  };
}
