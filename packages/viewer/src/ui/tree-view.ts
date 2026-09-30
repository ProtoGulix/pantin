import type { Translate } from "../i18n/translate.ts";
import { isDraggableNode } from "../tree/tree-drop.ts";
import { commandForKey, type TreeCommand } from "../tree/tree-navigation.ts";
import type { TreeRow } from "../tree/tree-rows.ts";
import { committingTextInput, element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { listenToDrags } from "./tree-drag.ts";
import { chevron, driveBolt, sensorMark, stateText, visibilityEye } from "./tree-row-parts.ts";

// The tree (role=tree, flat treeitems with aria-level). The container is
// built once: it keeps keyboard focus, points at the selected row through
// aria-activedescendant, and handles every pointer event by delegation, so
// rebuilding rows can never lose a click or a double-click.

export interface TreeView {
  tree: HTMLElement;
  render(
    rows: readonly TreeRow[],
    language: string,
    translate: Translate,
    intents: PanelIntents,
  ): void;
}

interface Current {
  rows: readonly TreeRow[];
  intents: PanelIntents | null;
  // Row elements by content signature, reused when nothing changed.
  elements: Map<string, HTMLElement>;
}

function rowElementId(index: number): string {
  return `tree-item-${index}`;
}

function dispatch(command: TreeCommand, intents: PanelIntents, tree: HTMLElement): void {
  switch (command.type) {
    case "select":
      intents.selectNode(command.nodeId);
      return;
    case "expand":
    case "collapse":
      intents.setExpanded(command.nodeId, command.type === "expand");
      return;
    case "activate":
      intents.activateNode(command.nodeId);
      return;
    case "rename":
      intents.startRename(command.nodeId);
      return;
    case "contextMenu": {
      const rect = tree.querySelector(".tree-row--selected")?.getBoundingClientRect();
      intents.openContextMenu(command.nodeId, rect?.left ?? 0, rect?.bottom ?? 0);
      return;
    }
    case "none":
      return;
  }
}

function labelOrRenameInput(
  row: TreeRow,
  translate: Translate,
  intents: PanelIntents,
  tree: HTMLElement,
): HTMLElement {
  if (!row.renaming) {
    return element("span", { className: "tree-row__label", text: row.label });
  }
  return committingTextInput(row.label, {
    label: translate("tree.renameLabel", { name: row.label }),
    focusKey: "tree-rename",
    onCommit: (name) => intents.commitRename(row.id, name),
    onCancel: () => intents.cancelRename(),
    // Enter sends focus back to the tree: that blur commits once, and the
    // keyboard stays in the tree after the redraw.
    focusOnEnter: () => tree.focus(),
  });
}

function rowAttributes(row: TreeRow, index: number): Record<string, string> {
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

function rowElement(
  row: TreeRow,
  index: number,
  translate: Translate,
  intents: PanelIntents,
  tree: HTMLElement,
): HTMLElement {
  const modifiers = [row.selected ? "tree-row--selected" : "", row.muted ? "tree-row--muted" : ""];
  const className = ["tree-row", ...modifiers].filter((name) => name !== "").join(" ");
  return element("div", { className, attributes: rowAttributes(row, index) }, [
    chevron(row),
    icon(row.icon, "icon tree-row__icon"),
    labelOrRenameInput(row, translate, intents, tree),
    stateText(row),
    row.detail === null
      ? null
      : element("span", { className: "tree-row__detail", text: row.detail }),
    driveBolt(row, translate),
    sensorMark(row, translate),
    visibilityEye(row, translate),
  ]);
}

// Everything that changes a row's element; the language is part of it since
// the rename field's label is translated.
function rowSignature(row: TreeRow, index: number, language: string): string {
  return JSON.stringify([row, index, language]);
}

interface Hit {
  row: TreeRow;
  // The data-action of the row part clicked (tree-row-parts.ts), if any.
  control: string | null;
  inInput: boolean;
}

function hitOf(event: Event, current: Current): Hit | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const nodeId = target.closest("[role=treeitem]")?.getAttribute("data-node-id");
  const row = current.rows.find((candidate) => candidate.id === nodeId);
  if (row === undefined) {
    return null;
  }
  return {
    row,
    control: target.closest("[data-action]")?.getAttribute("data-action") ?? null,
    inInput: target.closest("input") !== null,
  };
}

function runRowControl({ row, control }: Hit, intents: PanelIntents): void {
  if (control === "toggle") {
    intents.setExpanded(row.id, !row.expanded);
  } else if (control === "visibility") {
    intents.toggleAssemblyHidden(row.id);
  } else if (control === "drive") {
    intents.openDriveFormForJoint(row.id);
  } else if (control === "sensor") {
    // The first sensor: the others are listed next to it in the panel.
    intents.openSensorForm(row.wiring?.sensorIds[0] ?? null);
  }
}

function finishOpenRename(tree: HTMLElement): void {
  const renameInput = tree.querySelector<HTMLInputElement>('[data-focus-key="tree-rename"]');
  // Blurring commits the rename (see committingTextInput) before the new row is selected.
  if (renameInput !== null && document.activeElement === renameInput) {
    renameInput.blur();
  }
}

function listenToPointer(tree: HTMLElement, current: Current): void {
  // Selection on pointerdown: a click on another row while a rename is open
  // is never lost to the redraw that ends the rename.
  tree.addEventListener("pointerdown", (event) => {
    const hit = hitOf(event, current);
    const onControl = hit !== null && hit.control !== null;
    if (hit === null || hit.inInput || onControl || (event.button !== 0 && event.button !== 2)) {
      return;
    }
    finishOpenRename(tree);
    current.intents?.selectNode(hit.row.id);
  });
  tree.addEventListener("click", (event) => {
    const hit = hitOf(event, current);
    if (hit !== null && current.intents !== null) {
      runRowControl(hit, current.intents);
    }
  });
  tree.addEventListener("dblclick", (event) => {
    const hit = hitOf(event, current);
    if (hit === null || hit.inInput || hit.control !== null) {
      return;
    }
    if (hit.row.renamable) {
      current.intents?.startRename(hit.row.id);
    } else {
      current.intents?.activateNode(hit.row.id);
    }
  });
  tree.addEventListener("contextmenu", (event) => {
    const hit = hitOf(event, current);
    if (hit !== null && !hit.inInput) {
      event.preventDefault();
      current.intents?.openContextMenu(hit.row.id, event.clientX, event.clientY);
    }
  });
}

function listenToKeys(tree: HTMLElement, current: Current): void {
  tree.addEventListener("keydown", (event) => {
    const intents = current.intents;
    if (intents === null || event.target instanceof HTMLInputElement) {
      return;
    }
    const selected = current.rows.find((row) => row.selected)?.id ?? null;
    const command = commandForKey(current.rows, selected, event.key);
    if (command.type !== "none") {
      event.preventDefault();
      dispatch(command, intents, tree);
    }
  });
}

function updateRows(
  tree: HTMLElement,
  current: Current,
  language: string,
  translate: Translate,
  intents: PanelIntents,
): void {
  const elements = new Map<string, HTMLElement>();
  const ordered = current.rows.map((row, index) => {
    const signature = rowSignature(row, index, language);
    const reused =
      current.elements.get(signature) ?? rowElement(row, index, translate, intents, tree);
    elements.set(signature, reused);
    return reused;
  });
  current.elements = elements;
  const unchanged =
    ordered.length === tree.children.length &&
    ordered.every((row, index) => tree.children[index] === row);
  if (!unchanged) {
    tree.replaceChildren(...ordered);
  }
}

function focusAfterRender(tree: HTMLElement, hadRenameFocus: boolean): void {
  const renameInput = tree.querySelector<HTMLInputElement>('[data-focus-key="tree-rename"]');
  if (renameInput !== null && document.activeElement !== renameInput && !hadRenameFocus) {
    renameInput.focus();
    renameInput.select();
  } else if (renameInput === null && hadRenameFocus) {
    // The rename ended: keyboard focus goes back to the tree.
    tree.focus();
  }
}

function updateActiveDescendant(tree: HTMLElement, rows: readonly TreeRow[]): void {
  const selectedIndex = rows.findIndex((row) => row.selected);
  if (selectedIndex < 0) {
    tree.removeAttribute("aria-activedescendant");
    return;
  }
  tree.setAttribute("aria-activedescendant", rowElementId(selectedIndex));
  tree.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
}

export function createTreeView(): TreeView {
  const tree = element("div", { className: "tree", attributes: { role: "tree", tabindex: "0" } });
  const current: Current = { rows: [], intents: null, elements: new Map() };
  listenToKeys(tree, current);
  listenToPointer(tree, current);
  listenToDrags(tree, (dragged, target) => current.intents?.dropBody(dragged, target));
  return {
    tree,
    render: (rows, language, translate, intents) => {
      const hadRenameFocus =
        document.activeElement?.getAttribute("data-focus-key") === "tree-rename";
      current.rows = rows;
      current.intents = intents;
      tree.setAttribute("aria-label", translate("tree.label"));
      updateRows(tree, current, language, translate, intents);
      updateActiveDescendant(tree, rows);
      focusAfterRender(tree, hadRenameFocus);
    },
  };
}
