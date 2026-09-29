import type { Translate } from "../i18n/translate.ts";
import type { PropertyGroup, PropertyRow } from "../properties/properties-model.ts";
import { committingTextInput, element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// CODESYS-like two-column grid, as a real table: one <tbody> per group, with
// a header row whose button folds the group.

function valueCell(row: PropertyRow, translate: Translate, intents: PanelIntents): HTMLElement {
  const renameNodeId = row.renameNodeId;
  if (renameNodeId === null) {
    return element("td", {
      className: row.muted
        ? "property-grid__value property-grid__value--source"
        : "property-grid__value",
      text: row.value,
      attributes: { title: row.value },
    });
  }
  const input = committingTextInput(row.value, {
    label: translate("properties.editLabel", { property: row.label }),
    focusKey: `property-${row.id}`,
    onCommit: (value) => intents.commitRename(renameNodeId, value),
  });
  return element("td", { className: "property-grid__value property-grid__value--editable" }, [
    input,
  ]);
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
    : group.rows.map((row) =>
        element("tr", {}, [
          element("th", {
            className: "property-grid__name",
            text: row.label,
            attributes: { scope: "row" },
          }),
          valueCell(row, translate, intents),
        ]),
      );
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
