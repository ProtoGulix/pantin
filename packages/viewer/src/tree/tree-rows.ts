import {
  type Selection,
  selectedDeviceOf,
  selectedNodeIdOf,
  selectedNodeIdsOf,
} from "../selection.ts";
import { parseNodeId } from "./node-ids.ts";
import type { TreeIcon, TreeNode } from "./tree-node.ts";

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
  kindLabel: string | null;
  stateMark: TreeNode["stateMark"];
  depth: number;
  parentId: string | null;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
  // The first selected row: the one every command other than the grouping ones
  // acts on, and the keyboard's (ADR 0055 point 12).
  active: boolean;
  // A joint the selected device drives or watches (ADR 0030 point 1).
  related: boolean;
  renaming: boolean;
  positionInSet: number;
  setSize: number;
}

export interface TreeViewState {
  expandedNodeIds: ReadonlySet<string>;
  selection: Selection | null;
  // The tree's multi-selection (ADR 0055 point 12): empty, or the selected node
  // first, then the others.
  multiSelectedNodeIds?: readonly string[];
  renamingNodeId: string | null;
}

function isExpandable(node: TreeNode): boolean {
  return node.children.length > 0;
}

const NO_JOINTS: ReadonlySet<string> = new Set();

// Every row of a joint is related, whichever body lists it.
function isRelatedJoint(nodeId: string, relatedJointIds: ReadonlySet<string>): boolean {
  const ref = parseNodeId(nodeId);
  return ref?.kind === "joint" && relatedJointIds.has(ref.jointId);
}

// A device is selected by its own value, not by a node id: its row is the
// selected one (ADR 0047 point 4). The tree shows one Pantin, so the kind and
// the id are enough.
function isActiveRow(nodeId: string, selection: Selection | null): boolean {
  if (nodeId === selectedNodeIdOf(selection)) {
    return true;
  }
  const device = selectedDeviceOf(selection);
  const ref = device === null ? null : parseNodeId(nodeId);
  return ref?.kind === "device" && ref.deviceKind === device?.kind && ref.id === device.id;
}

/** Visible rows, depth first: children only under expanded nodes. */
export function flattenTree(
  nodes: readonly TreeNode[],
  view: TreeViewState,
  relatedJointIds: ReadonlySet<string> = NO_JOINTS,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const selectedIds = new Set(selectedNodeIdsOf(view.selection, view.multiSelectedNodeIds));
  const visit = (siblings: readonly TreeNode[], depth: number, parentId: string | null) => {
    siblings.forEach((node, index) => {
      const expanded = isExpandable(node) && view.expandedNodeIds.has(node.id);
      const active = isActiveRow(node.id, view.selection);
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
        kindLabel: node.kindLabel,
        stateMark: node.stateMark,
        depth,
        parentId,
        expandable: isExpandable(node),
        expanded,
        selected: active || selectedIds.has(node.id),
        active,
        related: isRelatedJoint(node.id, relatedJointIds),
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
