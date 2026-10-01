import type { Translate } from "../i18n/translate.ts";
import {
  liveKey,
  type PropertyGroup,
  type PropertyRow,
  type RowEditor,
  rowFocusKey,
} from "../properties/property-rows.ts";
import { committingTextInput, element, selectInput } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { followLink } from "./row-actions.ts";
import { numberControl, toggleControl } from "./row-controls.ts";

// CODESYS-like two-column grid, as a real table: one <tbody> per group, with
// a header row whose button folds the group.

// What the page needs to write a live value in place after a tag read.
function liveAttributes(liveId: string | null): Record<string, string> {
  return liveId === null ? {} : { "data-live-id": liveId };
}

// The value names another element (a joint of a body, a device): a click on
// the row selects it, and Enter on the link does too, as a click.
function linkCell(row: PropertyRow, liveId: string | null): HTMLElement {
  const link = element("button", {
    className: "property-grid__link",
    text: row.value,
    attributes: { type: "button", title: row.value },
  });
  const live =
    row.live === null
      ? null
      : element("span", {
          className: "property-grid__live",
          attributes: liveAttributes(liveId),
        });
  return element("td", { className: "property-grid__value" }, [link, live]);
}

function editorCell(
  row: PropertyRow,
  editor: RowEditor,
  liveId: string | null,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  if (editor.input === "toggle") {
    return toggleControl(row, editor, liveId, translate, intents);
  }
  if (editor.input === "number") {
    return numberControl(row, editor, liveId, translate, intents);
  }
  const commit = (value: string) => intents.commitPropertyEdit(editor.target, value);
  // A select commits as soon as another option is chosen; there is nothing to type.
  return editor.input === "select"
    ? selectInput(
        editor.options,
        editor.selected,
        translate("properties.editSelectLabel", { property: row.label }),
        (value) => (value === editor.selected ? undefined : commit(value)),
      )
    : committingTextInput(row.value, {
        label: translate("properties.editLabel", { property: row.label }),
        focusKey: rowFocusKey(row.id),
        onCommit: commit,
      });
}

function valueCell(
  row: PropertyRow,
  liveId: string | null,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const editor = row.edit;
  if (row.link !== null) {
    return linkCell(row, liveId);
  }
  if (editor !== null) {
    const control = editorCell(row, editor, liveId, translate, intents);
    const editable = editor.input === "text" || editor.input === "select";
    return element(
      "td",
      { className: `property-grid__value${editable ? " property-grid__value--editable" : ""}` },
      [control],
    );
  }
  if (row.live !== null) {
    // A diagnostics cell holds lines, so it wraps; the others are one value.
    // Only warnings are announced: a value changing every 250 ms would flood a screen reader.
    const diagnostics = row.live.kind === "diagnostics";
    return element("td", { className: "property-grid__value" }, [
      element("span", {
        className: diagnostics ? "property-grid__diagnostics" : "property-grid__live",
        attributes: { ...(diagnostics ? { role: "status" } : {}), ...liveAttributes(liveId) },
      }),
    ]);
  }
  return element("td", {
    className: row.muted
      ? "property-grid__value property-grid__value--source"
      : "property-grid__value",
    text: row.value,
    attributes: { title: row.value },
  });
}

function dataRow(
  group: PropertyGroup,
  row: PropertyRow,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const liveId = row.live === null ? null : liveKey(group.id, row.id);
  // The full tag name is the tooltip of a tag's row, as on the former cards.
  const attributes = row.live?.kind === "tag" ? { title: row.live.tag } : {};
  const className = row.link === null ? "" : "property-grid__row--link";
  const line = element("tr", { className, attributes }, [
    element("th", {
      className: "property-grid__name",
      text: row.label,
      attributes: { scope: "row" },
    }),
    valueCell(row, liveId, translate, intents),
  ]);
  const { link } = row;
  if (link !== null) {
    line.addEventListener("click", () => followLink(link, intents));
  }
  return line;
}

function groupBody(group: PropertyGroup, translate: Translate, intents: PanelIntents): HTMLElement {
  const toggle = element(
    "button",
    {
      className: "property-grid__group-toggle",
      attributes: { type: "button", "aria-expanded": String(!group.collapsed) },
    },
    [
      icon("chevron", group.collapsed ? "icon" : "icon icon--rotated"),
      element("span", { text: group.title }),
    ],
  );
  toggle.addEventListener("click", () => intents.togglePropertyGroup(group.id));
  const header = element("tr", { className: "property-grid__group" }, [
    element("th", { attributes: { colspan: "2", scope: "colgroup" } }, [toggle]),
  ]);
  const rows = group.collapsed
    ? []
    : group.rows.map((row) => dataRow(group, row, translate, intents));
  return element("tbody", {}, [header, ...rows]);
}

export function renderPropertiesGrid(
  groups: readonly PropertyGroup[],
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  if (groups.length === 0) {
    return element("p", { className: "pane-empty", text: translate("properties.empty") });
  }
  const head = element("thead", {}, [
    element("tr", {}, [
      element("th", { text: translate("properties.property"), attributes: { scope: "col" } }),
      element("th", { text: translate("properties.value"), attributes: { scope: "col" } }),
    ]),
  ]);
  return element("table", { className: "property-grid" }, [
    element("caption", { className: "visually-hidden", text: translate("properties.label") }),
    head,
    ...groups.map((group) => groupBody(group, translate, intents)),
  ]);
}
