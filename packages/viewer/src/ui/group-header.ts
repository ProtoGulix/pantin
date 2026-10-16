import { element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

/** The header row of a section of the properties grid: a button that folds it. */
export function groupHeader(
  group: { id: string; title: string; collapsed: boolean },
  intents: PanelIntents,
): HTMLElement {
  const toggle = element(
    "button",
    {
      className: "property-grid__group-toggle",
      attributes: {
        type: "button",
        "aria-expanded": String(!group.collapsed),
        // The panel is redrawn on folding: the key lets the focus come back to the button.
        "data-focus-key": `group-${group.id}`,
      },
    },
    [
      icon("chevron", group.collapsed ? "icon" : "icon icon--rotated"),
      element("span", { text: group.title }),
    ],
  );
  toggle.addEventListener("click", () => intents.togglePropertyGroup(group.id));
  return element("tr", { className: "property-grid__group" }, [
    element("th", { attributes: { colspan: "2", scope: "colgroup" } }, [toggle]),
  ]);
}
