import type { TreeRow } from "./tree-rows.ts";

// Keyboard behaviour of the tree (WAI-ARIA tree pattern, selection follows
// focus as in CODESYS and SolidWorks). Pure: rows and key in, command out.

export type TreeCommand =
  | { type: "select"; nodeId: string }
  | { type: "expand"; nodeId: string }
  | { type: "collapse"; nodeId: string }
  | { type: "activate"; nodeId: string }
  | { type: "rename"; nodeId: string }
  | { type: "contextMenu"; nodeId: string }
  | { type: "none" };

const NONE: TreeCommand = { type: "none" };

function selectAt(rows: readonly TreeRow[], index: number): TreeCommand {
  const row = rows[index];
  return row === undefined ? NONE : { type: "select", nodeId: row.id };
}

function commandRight(rows: readonly TreeRow[], index: number, row: TreeRow): TreeCommand {
  if (!row.expandable) {
    return NONE;
  }
  if (!row.expanded) {
    return { type: "expand", nodeId: row.id };
  }
  const next = rows[index + 1];
  return next !== undefined && next.parentId === row.id
    ? { type: "select", nodeId: next.id }
    : NONE;
}

function commandLeft(row: TreeRow): TreeCommand {
  if (row.expanded) {
    return { type: "collapse", nodeId: row.id };
  }
  return row.parentId === null ? NONE : { type: "select", nodeId: row.parentId };
}

function commandWithoutSelection(rows: readonly TreeRow[], key: string): TreeCommand {
  if (key === "ArrowDown" || key === "Home") {
    return selectAt(rows, 0);
  }
  if (key === "ArrowUp" || key === "End") {
    return selectAt(rows, rows.length - 1);
  }
  return NONE;
}

export function commandForKey(
  rows: readonly TreeRow[],
  selectedNodeId: string | null,
  key: string,
): TreeCommand {
  const index = rows.findIndex((row) => row.id === selectedNodeId);
  const row = rows[index];
  if (row === undefined) {
    return commandWithoutSelection(rows, key);
  }
  switch (key) {
    case "ArrowDown":
      return selectAt(rows, Math.min(index + 1, rows.length - 1));
    case "ArrowUp":
      return selectAt(rows, Math.max(index - 1, 0));
    case "Home":
      return selectAt(rows, 0);
    case "End":
      return selectAt(rows, rows.length - 1);
    case "ArrowRight":
      return commandRight(rows, index, row);
    case "ArrowLeft":
      return commandLeft(row);
    case "Enter":
      return { type: "activate", nodeId: row.id };
    case "F2":
      return row.renamable ? { type: "rename", nodeId: row.id } : NONE;
    case "ContextMenu":
      return { type: "contextMenu", nodeId: row.id };
    default:
      return NONE;
  }
}
