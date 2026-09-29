import type { Translate } from "../i18n/translate.ts";
import type { TreeRow } from "../tree/tree-model.ts";
import { element } from "./dom.ts";
import { icon } from "./icons.ts";

// Small parts of a tree row that react to a click on their own: the chevron
// that folds a branch, and the eye that hides an assembly in the 3D view.
// tree-view.ts finds them by their data-action.

export function chevron(row: TreeRow): HTMLElement {
  if (!row.expandable) {
    return element("span", { className: "tree-row__chevron" });
  }
  const open = row.expanded ? " tree-row__chevron--open" : "";
  return element(
    "span",
    { className: `tree-row__chevron${open}`, attributes: { "data-action": "toggle" } },
    [icon("chevron")],
  );
}

// Not a focusable button: the tree is one tab stop, and the context menu
// gives the keyboard the same choice. The icon is silent; the row's state
// label tells screen readers that the assembly is hidden.
export function visibilityEye(row: TreeRow, translate: Translate): HTMLElement | null {
  if (row.visibility === null) {
    return null;
  }
  const hidden = row.visibility === "hidden";
  const label = translate(hidden ? "menu.showAssembly" : "menu.hideAssembly");
  const modifier = hidden ? " tree-row__eye--hidden" : "";
  return element("span", { className: "tree-row__eye-slot" }, [
    element(
      "span",
      {
        className: `tree-row__eye${modifier}`,
        attributes: { "data-action": "visibility", title: label, "aria-hidden": "true" },
      },
      [icon(hidden ? "eye-off" : "eye")],
    ),
    row.stateLabel === null
      ? null
      : element("span", { className: "visually-hidden", text: row.stateLabel }),
  ]);
}
