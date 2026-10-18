import { parseNodeId } from "./node-ids.ts";
import type { TreeRow } from "./tree-rows.ts";

// Multi-selection in the tree (ADR 0055 point 12), as pure functions of the
// visible rows. Only body rows and group (assembly) rows under one assembly
// can be selected together: they are what "Grouper…" takes. Anything else
// stays a plain selection.

export interface ClickModifiers {
  // Ctrl, or Cmd on macOS: adds or removes the row.
  toggle: boolean;
  // Shift: the rows between the first selected row and this one.
  range: boolean;
}

type RowIdentity = Pick<TreeRow, "id" | "kind" | "parentId">;

// A group row needs an assembly above it: a top-level assembly hangs from the
// Pantin, which is not an assembly the core can group in.
function isMultiSelectable(row: RowIdentity): boolean {
  if (row.kind === "body") {
    return true;
  }
  const parent = row.parentId === null ? null : parseNodeId(row.parentId);
  return row.kind === "assembly" && parent?.kind === "assembly";
}

function inRangeOf(rows: readonly TreeRow[], anchor: TreeRow, clicked: TreeRow): TreeRow[] {
  const from = rows.indexOf(anchor);
  const to = rows.indexOf(clicked);
  const [low, high] = from < to ? [from, to] : [to, from];
  return rows
    .slice(low, high + 1)
    .filter((row) => row.parentId === clicked.parentId && isMultiSelectable(row));
}

// The selected rows, the first selected one first, then the others in tree order.
function selectedRows(rows: readonly TreeRow[]): TreeRow[] {
  const active = rows.filter((row) => row.active);
  return [...active, ...rows.filter((row) => row.selected && !row.active)];
}

function toggled(current: readonly TreeRow[], clicked: TreeRow): string[] {
  const ids = current.map((row) => row.id);
  if (!ids.includes(clicked.id)) {
    return [...ids, clicked.id];
  }
  // The last selected row stays: a selection is never emptied by a click.
  return ids.length === 1 ? ids : ids.filter((id) => id !== clicked.id);
}

/**
 * The rows selected after a click with Ctrl or Shift, the first one first, or
 * null for a plain click: the caller then simply selects the clicked row.
 * Ctrl or Shift on a row that cannot be multi-selected, or while the current
 * selection holds one, is a plain click too.
 */
export function rowClickSelection(
  rows: readonly TreeRow[],
  clickedId: string,
  modifiers: ClickModifiers,
): string[] | null {
  const clicked = rows.find((row) => row.id === clickedId);
  const current = selectedRows(rows);
  const [anchor] = current;
  if (clicked === undefined || anchor === undefined || !(modifiers.toggle || modifiers.range)) {
    return null;
  }
  const together = [...current, clicked].every(
    (row) => isMultiSelectable(row) && row.parentId === clicked.parentId,
  );
  if (!together) {
    return null;
  }
  if (!modifiers.range) {
    return toggled(current, clicked);
  }
  const between = inRangeOf(rows, anchor, clicked).filter((row) => row.id !== anchor.id);
  return [anchor.id, ...between.map((row) => row.id)];
}

// The end of the selected rows that Shift and the arrow keys move: the one
// away from the first selected row, which stays the anchor.
function movingEndIndex(rows: readonly TreeRow[]): number {
  const anchor = rows.findIndex((row) => row.active);
  const selected = rows.flatMap((row, index) => (row.selected ? [index] : []));
  return anchor === Math.min(...selected) ? Math.max(...selected) : Math.min(...selected);
}

/**
 * The sibling row Shift plus an arrow key reaches from the moving end of the
 * selection, skipping the rows unfolded under a sibling and the rows that cannot be multi-selected; null at the end of
 * the siblings or with nothing selected.
 */
export function siblingRowId(rows: readonly TreeRow[], step: 1 | -1): string | null {
  if (!rows.some((row) => row.active)) {
    return null;
  }
  const endIndex = movingEndIndex(rows);
  const end = rows[endIndex];
  for (let index = endIndex + step; end !== undefined; index += step) {
    const row = rows[index];
    // Past the siblings (a row above the end's level) or off the list.
    if (row === undefined || row.depth < end.depth) {
      return null;
    }
    // A joint row or other non-selectable row between siblings is stepped over.
    if (row.parentId === end.parentId && isMultiSelectable(row)) {
      return row.id;
    }
  }
  return null;
}
