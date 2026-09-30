import type { TreeIcon, TreeNode } from "./tree-model.ts";

// The flat list of visible rows the tree's DOM draws, from the tree of nodes
// (tree-model.ts). Pure, so it is tested without a browser.

export interface TreeRow {
  id: string;
  kind: TreeNode["kind"];
  icon: TreeIcon;
  label: string;
  detail: string | null;
  muted: boolean;
  renamable: boolean;
  visibility: TreeNode["visibility"];
  wiring: TreeNode["wiring"];
  stateLabel: string | null;
  depth: number;
  parentId: string | null;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
  renaming: boolean;
  positionInSet: number;
  setSize: number;
}

export interface TreeViewState {
  expandedNodeIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  renamingNodeId: string | null;
}

function isExpandable(node: TreeNode): boolean {
  return node.children.length > 0;
}

/** Visible rows, depth first: children only under expanded nodes. */
export function flattenTree(nodes: readonly TreeNode[], view: TreeViewState): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (siblings: readonly TreeNode[], depth: number, parentId: string | null) => {
    siblings.forEach((node, index) => {
      const expanded = isExpandable(node) && view.expandedNodeIds.has(node.id);
      rows.push({
        id: node.id,
        kind: node.kind,
        icon: node.icon,
        label: node.label,
        detail: node.detail,
        muted: node.muted,
        renamable: node.renamable,
        visibility: node.visibility,
        wiring: node.wiring,
        stateLabel: node.stateLabel,
        depth,
        parentId,
        expandable: isExpandable(node),
        expanded,
        selected: node.id === view.selectedNodeId,
        renaming: node.id === view.renamingNodeId,
        positionInSet: index + 1,
        setSize: siblings.length,
      });
      if (expanded) {
        visit(node.children, depth + 1, node.id);
      }
    });
  };
  visit(nodes, 0, null);
  return rows;
}
