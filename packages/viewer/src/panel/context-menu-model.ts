import { type AssemblyDisplay, isAssemblyHidden } from "../assembly-display.ts";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import { type NodeRef, parseNodeId } from "../tree/node-ids.ts";
import { buildTree, findNode } from "../tree/tree-model.ts";
import type { ViewerState } from "../viewer-state.ts";

// Entries of the tree's right-click menu, as data.

export type ContextAction =
  | "rename"
  | "frame"
  | "importInto"
  | "newAssembly"
  | "newJoint"
  | "changeJointType"
  | "toggleAssemblyHidden"
  | "toggleAssemblyIsolated"
  | "delete";

export interface ContextMenuView {
  nodeId: string;
  title: string;
  x: number;
  y: number;
  entries: { action: ContextAction; label: string }[];
}

/**
 * Entries depend on the node: only Pantins accept an import or a new
 * assembly, assemblies and the "between assemblies" folder a new joint, only
 * joints a type change, bodies, joints and assemblies a deletion. An
 * assembly can also be hidden or isolated in the 3D view.
 */
export function contextEntries(ref: NodeRef, renamable: boolean): ContextAction[] {
  const entries: ContextAction[] = renamable ? ["rename"] : [];
  entries.push("frame");
  if (ref.kind === "pantin") {
    entries.push("importInto", "newAssembly");
  }
  if (ref.kind === "assembly" || ref.kind === "folder") {
    entries.push("newJoint");
  }
  if (ref.kind === "assembly") {
    entries.push("toggleAssemblyHidden", "toggleAssemblyIsolated");
  }
  if (ref.kind === "joint") {
    entries.push("changeJointType");
  }
  if (ref.kind === "body" || ref.kind === "joint" || ref.kind === "assembly") {
    entries.push("delete");
  }
  return entries;
}

const CONTEXT_LABELS = {
  rename: "menu.rename",
  frame: "menu.frame",
  importInto: "menu.importInto",
  newAssembly: "menu.newAssembly",
  newJoint: "menu.newJoint",
  changeJointType: "menu.changeJointType",
  toggleAssemblyHidden: "menu.hideAssembly",
  toggleAssemblyIsolated: "menu.isolateAssembly",
  delete: "menu.delete",
} as const;

// The visibility entries say what they will do: show a hidden assembly, or
// show every assembly again once one is isolated.
function labelKeyOf(action: ContextAction, ref: NodeRef, display: AssemblyDisplay): MessageKey {
  if (ref.kind === "assembly" && action === "toggleAssemblyHidden") {
    return isAssemblyHidden(display, ref.key) ? "menu.showAssembly" : "menu.hideAssembly";
  }
  if (ref.kind === "assembly" && action === "toggleAssemblyIsolated") {
    return display.isolatedAssemblyKey === ref.key
      ? "menu.showAllAssemblies"
      : "menu.isolateAssembly";
  }
  return CONTEXT_LABELS[action];
}

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
      label: t(labelKeyOf(action, ref, state.assemblyDisplay)),
    })),
  };
}
