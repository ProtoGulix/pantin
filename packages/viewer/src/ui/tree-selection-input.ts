import { rowClickSelection, siblingRowId } from "../tree/row-selection.ts";
import type { TreeRow } from "../tree/tree-rows.ts";
import type { PanelIntents } from "./panel-intents.ts";

// Pointer and keyboard input that selects several rows of the tree (ADR 0055
// point 12). The rules are in tree/row-selection.ts; this only reads the event.

/**
 * Ctrl (or Cmd) adds or removes a row, Shift selects a range; a click that
 * cannot multi-select is a plain click.
 */
export function selectWithModifiers(
  rows: readonly TreeRow[],
  intents: PanelIntents | null,
  nodeId: string,
  modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
): void {
  const nodeIds = rowClickSelection(rows, nodeId, {
    toggle: modifiers.ctrlKey || modifiers.metaKey,
    range: modifiers.shiftKey,
  });
  if (nodeIds === null) {
    intents?.selectNode(nodeId);
  } else {
    intents?.selectNodes(nodeIds);
  }
}

/** Shift plus Up or Down extends the selection one sibling at a time. */
export function extendSelectionByKey(
  rows: readonly TreeRow[],
  intents: PanelIntents,
  key: string,
): boolean {
  const step = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : null;
  const target = step === null ? null : siblingRowId(rows, step);
  if (target === null) {
    return false;
  }
  selectWithModifiers(rows, intents, target, { ctrlKey: false, metaKey: false, shiftKey: true });
  return true;
}
