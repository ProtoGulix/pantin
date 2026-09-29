import type { Assembly, Body, Joint, PantinResponse } from "@pantin/protocol";
import { pluralKey, type Translate } from "../i18n/translate.ts";
import { jointTypeLabelKey } from "../joints/joint-labels.ts";
import {
  assemblyNodeId,
  bodyNodeId,
  folderNodeId,
  jointNodeId,
  type NodeRef,
  pantinNodeId,
  sourceNodeNodeId,
} from "./node-ids.ts";

// The tree of the left panel as plain data: first the full tree of nodes,
// then the flat list of visible rows the DOM draws. Pure, so it is tested
// without a browser.

export type TreeIcon =
  | "pantin"
  | "assembly"
  | "folder"
  | "body-glb"
  | "body-stl"
  | "body-step"
  | "joint"
  | "source-node";

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
  children: readonly TreeNode[];
}

export interface TreeSource {
  openPantin: PantinResponse | null;
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

// The joints holding a body, listed under it before the CAD nodes; the
// detail says whether the body is the joint's parent or its child.
function bodyJointChildren(pantin: PantinResponse, body: Body, translate: Translate): TreeNode[] {
  return pantin.document.joints.flatMap((joint): TreeNode[] => {
    if (joint.parent !== body.id && joint.child !== body.id) {
      return [];
    }
    const role = joint.child === body.id ? "tree.jointRole.child" : "tree.jointRole.parent";
    return [
      {
        ...jointNode(pantin.id, joint, translate),
        id: jointNodeId(pantin.id, joint.id, body.id),
        detail: translate(role, { type: translate(jointTypeLabelKey(joint.type)) }),
      },
    ];
  });
}

function bodyNode(pantin: PantinResponse, body: Body, translate: Translate): TreeNode {
  return {
    id: bodyNodeId(pantin.id, body.id),
    kind: "body",
    icon: `body-${body.source.format}`,
    label: body.name,
    detail: null,
    muted: false,
    renamable: true,
    children: [
      ...bodyJointChildren(pantin, body, translate),
      ...sourceNodeChildren(pantin.id, body, translate),
    ],
  };
}

function jointNode(pantinId: string, joint: Joint, translate: Translate): TreeNode {
  return {
    id: jointNodeId(pantinId, joint.id),
    kind: "joint",
    icon: "joint",
    label: joint.name,
    detail: translate(jointTypeLabelKey(joint.type)),
    muted: false,
    renamable: false,
    children: [],
  };
}

// A joint is internal when both its bodies share an assembly (ADR 0019
// point 4): it is listed under that assembly, the others in one folder.
function assemblyOf(pantin: PantinResponse, bodyId: string): string | undefined {
  return pantin.document.bodies.find((body) => body.id === bodyId)?.assembly;
}

function isInternal(pantin: PantinResponse, joint: Joint): boolean {
  return assemblyOf(pantin, joint.parent) === assemblyOf(pantin, joint.child);
}

function assemblyNode(pantin: PantinResponse, assembly: Assembly, translate: Translate): TreeNode {
  const bodies = pantin.document.bodies.filter((body) => body.assembly === assembly.key);
  const joints = pantin.document.joints.filter(
    (joint) => isInternal(pantin, joint) && assemblyOf(pantin, joint.child) === assembly.key,
  );
  return {
    id: assemblyNodeId(pantin.id, assembly.key),
    kind: "assembly",
    icon: "assembly",
    label: assembly.name,
    // The key prefixes the tags: shown so that the user sees what the PLC sees.
    detail: assembly.key,
    muted: false,
    renamable: true,
    children: [
      ...bodies.map((body) => bodyNode(pantin, body, translate)),
      ...joints.map((joint) => jointNode(pantin.id, joint, translate)),
    ],
  };
}

function betweenAssembliesFolder(pantin: PantinResponse, translate: Translate): TreeNode {
  const joints = pantin.document.joints.filter((joint) => !isInternal(pantin, joint));
  return {
    id: folderNodeId(pantin.id, "betweenAssemblies"),
    kind: "folder",
    icon: "folder",
    label: translate("tree.jointsBetweenAssemblies"),
    detail: String(joints.length),
    muted: false,
    renamable: false,
    children: joints.map((joint) => jointNode(pantin.id, joint, translate)),
  };
}

function pantinNode(pantin: PantinResponse, translate: Translate): TreeNode {
  const bodyCount = pantin.document.bodies.length;
  return {
    id: pantinNodeId(pantin.id),
    kind: "pantin",
    icon: "pantin",
    label: pantin.document.name,
    detail: translate(pluralKey("tree.bodyCount", bodyCount), { count: bodyCount }),
    muted: false,
    renamable: true,
    children: [
      ...pantin.document.assemblies.map((assembly) => assemblyNode(pantin, assembly, translate)),
      betweenAssembliesFolder(pantin, translate),
    ],
  };
}

/** The edit view's tree: exactly one root, the open Pantin; empty in the list view. */
export function buildTree(source: TreeSource, translate: Translate): TreeNode[] {
  return source.openPantin === null ? [] : [pantinNode(source.openPantin, translate)];
}

export function findNode(nodes: readonly TreeNode[], nodeId: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const inChildren = findNode(node.children, nodeId);
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
