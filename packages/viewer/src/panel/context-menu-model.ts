import type { Translate } from "../i18n/translate.ts";
import { buildTree, findNode, type TreeRow } from "../tree/tree-model.ts";
import type { ViewerState } from "../viewer-state.ts";

// Entries of the tree's right-click menu, as data.

export type ContextAction = "rename" | "frame" | "importInto" | "delete";

export interface ContextMenuView {
  nodeId: string;
  title: string;
  x: number;
  y: number;
  entries: { action: ContextAction; label: string }[];
}

/** Entries depend on the node: only Pantins accept an import, only bodies a deletion. */
export function contextEntries(kind: TreeRow["kind"], renamable: boolean): ContextAction[] {
  const entries: ContextAction[] = renamable ? ["rename"] : [];
  entries.push("frame");
  if (kind === "pantin") {
    entries.push("importInto");
  }
  if (kind === "body") {
    entries.push("delete");
  }
  return entries;
}

const CONTEXT_LABELS = {
  rename: "menu.rename",
  frame: "menu.frame",
  importInto: "menu.importInto",
  delete: "menu.delete",
} as const;

export function buildContextMenuView(state: ViewerState, t: Translate): ContextMenuView | null {
  const menu = state.contextMenu;
  const node = menu === null ? null : findNode(buildTree(state, t), menu.nodeId);
  if (menu === null || node === null) {
    return null;
  }
  return {
    nodeId: node.id,
    title: t("menu.label", { name: node.label }),
    x: menu.x,
    y: menu.y,
    entries: contextEntries(node.kind, node.renamable).map((action) => ({
      action,
      label: t(CONTEXT_LABELS[action]),
    })),
  };
}
