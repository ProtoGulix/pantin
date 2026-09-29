import type { Body, PantinResponse, PantinSummary } from "@pantin/protocol";
import { type MessageKey, pluralKey, type Translate } from "../i18n/translate.ts";
import {
  bodyNodeId,
  type FolderKey,
  folderNodeId,
  type NodeRef,
  pantinNodeId,
  sourceNodeNodeId,
} from "./node-ids.ts";

// The tree of the left panel as plain data: first the full tree of nodes,
// then the flat list of visible rows the DOM draws. Pure, so it is tested
// without a browser.

export type TreeIcon = "pantin" | "folder" | "body-glb" | "body-stl" | "body-step" | "source-node";

export interface TreeNode {
  id: string;
  kind: NodeRef["kind"];
  icon: TreeIcon;
  label: string;
  // Secondary text after the label (a count, a path), or null.
  detail: string | null;
  // Read-only data from the source file: drawn greyed.
  muted: boolean;
  renamable: boolean;
  // null: the node has children that are not loaded yet (a closed Pantin).
  children: readonly TreeNode[] | null;
}

export interface TreeSource {
  pantins: readonly PantinSummary[];
  openPantin: PantinResponse | null;
}

// Folders under an open Pantin, in display order. Joints, drives, sensors and
// tags will each be one more entry here, with no change to the rest.
interface FolderDefinition {
  key: FolderKey;
  labelKey: MessageKey;
  children(pantin: PantinResponse, translate: Translate): TreeNode[];
}

function sourceNodeChildren(pantinId: string, body: Body, translate: Translate): TreeNode[] {
  return body.source.nodes.map((node, index) => ({
    id: sourceNodeNodeId(pantinId, body.id, index),
    kind: "sourceNode",
    icon: "source-node",
    label: node.name === "" ? translate("tree.unnamedNode") : node.name,
    detail: node.path.join("/"),
    muted: true,
    renamable: false,
    children: [],
  }));
}

function bodyNode(pantinId: string, body: Body, translate: Translate): TreeNode {
  return {
    id: bodyNodeId(pantinId, body.id),
    kind: "body",
    icon: `body-${body.source.format}`,
    label: body.name,
    detail: null,
    muted: false,
    renamable: true,
    children: sourceNodeChildren(pantinId, body, translate),
  };
}

const PANTIN_FOLDERS: readonly FolderDefinition[] = [
  {
    key: "bodies",
    labelKey: "tree.bodies",
    children: (pantin, translate) =>
      pantin.document.bodies.map((body) => bodyNode(pantin.id, body, translate)),
  },
];

function folderNodes(pantin: PantinResponse, translate: Translate): TreeNode[] {
  return PANTIN_FOLDERS.map((folder) => {
    const children = folder.children(pantin, translate);
    return {
      id: folderNodeId(pantin.id, folder.key),
      kind: "folder",
      icon: "folder",
      label: translate(folder.labelKey),
      detail: String(children.length),
      muted: false,
      renamable: false,
      children,
    };
  });
}

function pantinNode(summary: PantinSummary, source: TreeSource, translate: Translate): TreeNode {
  const open = source.openPantin?.id === summary.id ? source.openPantin : null;
  const bodyCount = open?.document.bodies.length ?? summary.bodyCount;
  return {
    id: pantinNodeId(summary.id),
    kind: "pantin",
    icon: "pantin",
    label: open?.document.name ?? summary.name,
    detail: translate(pluralKey("tree.bodyCount", bodyCount), { count: bodyCount }),
    muted: false,
    renamable: true,
    children: open === null ? null : folderNodes(open, translate),
  };
}

export function buildTree(source: TreeSource, translate: Translate): TreeNode[] {
  const { openPantin } = source;
  // A Pantin just created may be open before the list is refreshed.
  const missingOpen =
    openPantin !== null && !source.pantins.some((summary) => summary.id === openPantin.id)
      ? [{ id: openPantin.id, name: openPantin.document.name, bodyCount: 0 }]
      : [];
  return [...source.pantins, ...missingOpen].map((summary) =>
    pantinNode(summary, source, translate),
  );
}

export function findNode(nodes: readonly TreeNode[], nodeId: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const inChildren = findNode(node.children ?? [], nodeId);
    if (inChildren !== null) {
      return inChildren;
    }
  }
  return null;
}

export interface TreeRow {
  id: string;
  kind: TreeNode["kind"];
  icon: TreeIcon;
  label: string;
  detail: string | null;
  muted: boolean;
  renamable: boolean;
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
  return node.children === null || node.children.length > 0;
}

/** Visible rows, depth first: children only under expanded, loaded nodes. */
export function flattenTree(nodes: readonly TreeNode[], view: TreeViewState): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (siblings: readonly TreeNode[], depth: number, parentId: string | null) => {
    siblings.forEach((node, index) => {
      const expanded =
        node.children !== null && isExpandable(node) && view.expandedNodeIds.has(node.id);
      rows.push({
        id: node.id,
        kind: node.kind,
        icon: node.icon,
        label: node.label,
        detail: node.detail,
        muted: node.muted,
        renamable: node.renamable,
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
        visit(node.children ?? [], depth + 1, node.id);
      }
    });
  };
  visit(nodes, 0, null);
  return rows;
}
