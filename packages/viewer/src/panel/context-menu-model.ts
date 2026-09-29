import type { Translate } from "../i18n/translate.ts";
import { type NodeRef, parseNodeId } from "../tree/node-ids.ts";
import { buildTree, findNode } from "../tree/tree-model.ts";
import type { ViewerState } from "../viewer-state.ts";

// Entries of the tree's right-click menu, as data.

export type ContextAction = "rename" | "frame" | "importInto" | "newJoint" | "delete";

export interface ContextMenuView {
  nodeId: string;
  title: string;
  x: number;
  y: number;
  entries: { action: ContextAction; label: string }[];
}

/**
 * Entries depend on the node: only Pantins accept an import, only the joints
 * folder a new joint, only bodies and joints a deletion.
 */
export function contextEntries(ref: NodeRef, renamable: boolean): ContextAction[] {
  const entries: ContextAction[] = renamable ? ["rename"] : [];
  entries.push("frame");
  if (ref.kind === "pantin") {
    entries.push("importInto");
  }
  if (ref.kind === "folder" && ref.folder === "joints") {
    entries.push("newJoint");
  }
  if (ref.kind === "body" || ref.kind === "joint") {
    entries.push("delete");
  }
  return entries;
}

const CONTEXT_LABELS = {
  rename: "menu.rename",
  frame: "menu.frame",
  importInto: "menu.importInto",
  newJoint: "menu.newJoint",
  delete: "menu.delete",
} as const;

export function buildContextMenuView(state: ViewerState, t: Translate): ContextMenuView | null {
  const menu = state.contextMenu;
  const node = menu === null ? null : findNode(buildTree(state, t), menu.nodeId);
  const ref = menu === null ? null : parseNodeId(menu.nodeId);
  if (menu === null || node === null || ref === null) {
    return null;
  }
  return {
    nodeId: node.id,
    title: t("menu.label", { name: node.label }),
    x: menu.x,
    y: menu.y,
    entries: contextEntries(ref, node.renamable).map((action) => ({
      action,
      label: t(CONTEXT_LABELS[action]),
    })),
  };
}
