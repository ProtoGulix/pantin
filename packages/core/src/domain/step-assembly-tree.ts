import type { SourceNode } from "@pantin/protocol";
import { toDisplayName } from "./import-body.ts";

// The structure of a STEP import (ADR 0040), rebuilt from the node chain the
// converter gives every kept component. Pure: components are named by their
// index in the converter's order, nothing here touches a document.

export type ChainComponent = { nodes: readonly SourceNode[] };

// One assembly to create. `parent` is the index of its parent in the plan.
export type PlannedAssembly = {
  name: string;
  parent: number | undefined;
  components: number[];
};

// A fixed joint to create, between two components.
export type PlannedLink = { parent: number; child: number };

export type StepTreePlan = { assemblies: PlannedAssembly[]; links: PlannedLink[] };

type TreeNode = { name: string; components: number[]; children: Map<string, TreeNode> };

function emptyNode(name: string): TreeNode {
  return { name, components: [], children: new Map() };
}

function pathKey(node: SourceNode): string {
  return node.path.join(".");
}

// Walks the chain without its last node (the part itself) from `top`,
// creating the assembly nodes on the way, and returns the deepest one (`top`
// for a chain of at most one node).
function nodeOfComponent(top: TreeNode, chain: readonly SourceNode[]): TreeNode {
  let current = top;
  for (const node of chain.slice(0, -1)) {
    const key = pathKey(node);
    const known = current.children.get(key);
    const next = known ?? emptyNode(node.name);
    current.children.set(key, next);
    current = next;
  }
  return current;
}

function rootKeys(components: readonly ChainComponent[]): Set<string> {
  const keys = new Set<string>();
  for (const { nodes } of components) {
    const [root] = nodes;
    if (root !== undefined) {
      keys.add(pathKey(root));
    }
  }
  return keys;
}

// A single root, assembly or lone part, is the top assembly and keeps its
// name, as before ADR 0040; several roots or no chain hang under an assembly
// named after the file.
function hasSingleRoot(components: readonly ChainComponent[]): boolean {
  return rootKeys(components).size === 1;
}

function buildTree(components: readonly ChainComponent[], fileName: string): TreeNode {
  const single = hasSingleRoot(components);
  const rootName = components.find(({ nodes }) => nodes[0] !== undefined)?.nodes[0]?.name;
  const top = emptyNode(single && rootName !== undefined ? rootName : fileName);
  components.forEach(({ nodes }, index) => {
    // The single root is the top itself: its chain starts below it.
    nodeOfComponent(top, single ? nodes.slice(1) : nodes).components.push(index);
  });
  return top;
}

function flatten(top: TreeNode, fallbackName: string): PlannedAssembly[] {
  const out: PlannedAssembly[] = [];
  const visit = (node: TreeNode, parent: number | undefined): void => {
    const position = out.length;
    out.push({ name: toDisplayName(node.name, fallbackName), parent, components: node.components });
    for (const child of node.children.values()) {
      visit(child, position);
    }
  };
  visit(top, undefined);
  return out;
}

export function planStepTree(
  components: readonly ChainComponent[],
  fileName: string,
): StepTreePlan {
  const fallback = toDisplayName(fileName, "Assembly");
  const assemblies = flatten(buildTree(components, fallback), fallback);
  return { assemblies, links: planLinks(assemblies) };
}

// The handle of an assembly: its first direct component, else the handle of
// its first child assembly that has one (ADR 0040 point 3).
function handlesOf(assemblies: readonly PlannedAssembly[]): (number | undefined)[] {
  const handles: (number | undefined)[] = [];
  for (let at = assemblies.length - 1; at >= 0; at -= 1) {
    const own = assemblies[at]?.components[0];
    handles[at] =
      own ??
      assemblies
        .flatMap((child, index) => (child.parent === at ? [handles[index]] : []))
        .find((handle) => handle !== undefined);
  }
  return handles;
}

function planLinks(assemblies: readonly PlannedAssembly[]): PlannedLink[] {
  const handles = handlesOf(assemblies);
  const links: PlannedLink[] = [];
  assemblies.forEach((assembly, at) => {
    const handle = handles[at];
    if (handle === undefined) {
      return;
    }
    for (const child of assembly.components.slice(1)) {
      links.push({ parent: handle, child });
    }
    assemblies.forEach((candidate, index) => {
      const childHandle = handles[index];
      if (candidate.parent === at && childHandle !== undefined && childHandle !== handle) {
        links.push({ parent: handle, child: childHandle });
      }
    });
  });
  return links;
}
