import type { PantinDocument } from "@pantin/protocol";
import {
  BAND_GAP,
  BAND_HEADER_HEIGHT,
  BAND_PADDING,
  columnX,
  DIAGRAM_WIDTH,
  MARGIN,
  NODE_TITLE_HEIGHT,
  NODE_WIDTH,
  SOCKET_PITCH,
} from "./diagram-constants.ts";
import { edgesOf } from "./diagram-edges.ts";
import { buildForest, type ForestNode } from "./diagram-forest.ts";
import { nodeHeight, placeRows, rowPitch } from "./diagram-rows.ts";
import type { SocketSpec } from "./diagram-sockets.ts";
import type {
  ChainDiagram,
  DiagramBand,
  DiagramEdge,
  DiagramNode,
  Socket,
} from "./diagram-types.ts";

// The chain diagram of ADR 0029, computed from the document and the set of
// collapsed assembly keys. Pure: same input, same output, nothing stored.
//
// Choices the ADR leaves open:
// - a collapsed band is its header line alone: it has no node and no edge, as
//   no chain crosses bands, and the bands below move up;
// - an expanded band without any chain is its header plus padding;
// - a root whose assembly is not listed goes to the first band, and with no
//   assembly at all nothing is drawn (the schema refuses both; this only keeps
//   a half-edited document drawable);
// - sensors cannot watch a fixed joint (the protocol refuses it), so leaving
//   fixed joints out never orphans a sensor.

function socketsAt(specs: SocketSpec[], left: number, top: number, width: number): Socket[] {
  return specs.map((spec, index) => ({
    ...spec,
    x: spec.side === "left" ? left : left + width,
    y: top + NODE_TITLE_HEIGHT + (index + 0.5) * SOCKET_PITCH,
  }));
}

function placeNode(
  node: ForestNode,
  band: DiagramBand,
  position: { centreY: number; row: number },
): DiagramNode {
  const height = nodeHeight(node);
  const top = position.centreY - height / 2;
  const left = columnX(node.column);
  return {
    id: node.id,
    kind: node.kind,
    elementId: node.elementId,
    label: node.label,
    elementType: node.elementType,
    row: position.row,
    column: node.column,
    x: left,
    y: top,
    width: NODE_WIDTH,
    height,
    band: band.key,
    sockets: [
      ...socketsAt(node.sockets.left, left, top, NODE_WIDTH),
      ...socketsAt(node.sockets.right, left, top, NODE_WIDTH),
    ],
  };
}

function flatten(roots: readonly ForestNode[]): ForestNode[] {
  return roots.flatMap((root) => [root, ...flatten(root.children)]);
}

interface BandLayout {
  band: DiagramBand;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

function layoutBand(
  band: DiagramBand,
  roots: readonly ForestNode[],
  assemblyNames: ReadonlyMap<string, string>,
): BandLayout {
  const pitch = rowPitch(roots);
  const { centres, firstRows, rowCount } = placeRows(roots);
  const bodyTop = band.y + BAND_HEADER_HEIGHT + BAND_PADDING;
  const placed = new Map<string, DiagramNode>();
  for (const node of flatten(roots)) {
    const placedNode = placeNode(node, band, {
      centreY: bodyTop + (centres.get(node) ?? 0) * pitch,
      row: firstRows.get(node) ?? 0,
    });
    // No badge for a joint whose body is unknown: there is no assembly to name.
    if (node.assembly !== undefined && node.assembly !== band.key) {
      placedNode.foreignAssembly = {
        key: node.assembly,
        name: assemblyNames.get(node.assembly) ?? node.assembly,
      };
    }
    placed.set(node.id, placedNode);
  }
  const height = BAND_HEADER_HEIGHT + 2 * BAND_PADDING + rowCount * pitch;
  return {
    band: { ...band, height },
    nodes: [...placed.values()].sort((a, b) => a.row - b.row || a.column - b.column),
    edges: edgesOf(roots, placed),
  };
}

function rootsByBand(
  document: PantinDocument,
  forest: readonly ForestNode[],
): Map<string, ForestNode[]> {
  const keys = new Set(document.assemblies.map((assembly) => assembly.key));
  const fallback = document.assemblies[0]?.key;
  const byBand = new Map<string, ForestNode[]>();
  for (const root of forest) {
    const key = root.assembly !== undefined && keys.has(root.assembly) ? root.assembly : fallback;
    if (key !== undefined) {
      byBand.set(key, [...(byBand.get(key) ?? []), root]);
    }
  }
  return byBand;
}

export function layoutChainDiagram(
  document: PantinDocument,
  collapsed: ReadonlySet<string>,
): ChainDiagram {
  const roots = rootsByBand(document, buildForest(document));
  const names = new Map(document.assemblies.map((assembly) => [assembly.key, assembly.name]));
  const bands: DiagramBand[] = [];
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  let y = MARGIN;
  for (const assembly of document.assemblies) {
    const isCollapsed = collapsed.has(assembly.key);
    const header: DiagramBand = {
      key: assembly.key,
      name: assembly.name,
      collapsed: isCollapsed,
      y,
      height: BAND_HEADER_HEIGHT,
    };
    const layout = isCollapsed
      ? { band: header, nodes: [], edges: [] }
      : layoutBand(header, roots.get(assembly.key) ?? [], names);
    bands.push(layout.band);
    nodes.push(...layout.nodes);
    edges.push(...layout.edges);
    y += layout.band.height + BAND_GAP;
  }
  const bottom = bands.length === 0 ? MARGIN : y - BAND_GAP;
  return { width: DIAGRAM_WIDTH, height: bottom + MARGIN, bands, nodes, edges };
}
