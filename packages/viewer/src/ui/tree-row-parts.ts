import type { Translate } from "../i18n/translate.ts";
import { isDraggableNode } from "../tree/tree-drop.ts";
import type { TreeRow } from "../tree/tree-rows.ts";
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

// The bolt of a joint an actuator moves, clickable like the eye: it opens the
// joint's actuator in the inspector. Silent too: the state text names it.
export function actuatorBolt(row: TreeRow, translate: Translate): HTMLElement | null {
  if (row.wiring === null || row.wiring.actuatorId === null) {
    return null;
  }
  return element(
    "span",
    {
      className: "tree-row__bolt",
      attributes: {
        "data-action": "actuator",
        title: translate("menu.editJointActuator"),
        "aria-hidden": "true",
      },
    },
    [icon("bolt")],
  );
}

// The mark of a watched joint, after the bolt: it opens the joint's first
// sensor in the right-hand panel (ADR 0023). Silent too: the state text names
// the sensors.
export function sensorMark(row: TreeRow, translate: Translate): HTMLElement | null {
  if (row.wiring === null || row.wiring.sensorIds.length === 0) {
    return null;
  }
  return element(
    "span",
    {
      className: "tree-row__sensor",
      attributes: {
        "data-action": "sensor",
        title: translate("sensors.form.editTitle"),
        "aria-hidden": "true",
      },
    },
    [icon("sensor")],
  );
}

/** What the row's icons say, for screen readers only (the row's tooltip shows it). */
export function stateText(row: TreeRow): HTMLElement | null {
  return row.stateLabel === null
    ? null
    : element("span", { className: "visually-hidden", text: row.stateLabel });
}

// Not a focusable button: the tree is one tab stop, and the context menu
// gives the keyboard the same choice. The icon is silent; the row's state
// text tells screen readers that the assembly is hidden.
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
  ]);
}

/** The classes of a row: its states, which the stylesheet tells apart. */
export function rowClassName(row: TreeRow): string {
  const flags: [boolean, string][] = [
    [row.selected, "tree-row--selected"],
    [row.related, "tree-row--related"],
    [row.muted, "tree-row--muted"],
  ];
  return ["tree-row", ...flags.filter(([on]) => on).map(([, name]) => name)].join(" ");
}

export function rowElementId(index: number): string {
  return `tree-item-${index}`;
}

/** The attributes of a row: its tree item role, position and state. */
export function rowAttributes(row: TreeRow, index: number): Record<string, string> {
  const attributes: Record<string, string> = {
    role: "treeitem",
    id: rowElementId(index),
    "data-node-id": row.id,
    "aria-level": String(row.depth + 1),
    "aria-setsize": String(row.setSize),
    "aria-posinset": String(row.positionInSet),
    "aria-selected": String(row.selected),
    style: `--depth: ${row.depth}`,
  };
  if (row.expandable) {
    attributes["aria-expanded"] = String(row.expanded);
  }
  if (row.stateLabel !== null) {
    attributes.title = row.stateLabel;
  }
  // A body can be dropped on another assembly (tree-drag.ts); not while its
  // name is edited, where a drag would select text.
  if (isDraggableNode(row.id) && !row.renaming) {
    attributes.draggable = "true";
  }
  return attributes;
}
