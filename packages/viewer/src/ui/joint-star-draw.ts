import type { Translate } from "../i18n/translate.ts";
import {
  type PlacedEdge,
  type PlacedNode,
  type StarLayout,
  WORLD_LABEL_DROP,
} from "../joint-star/joint-star-layout.ts";
import { projectEdge, type StarViewport, toScreen } from "../joint-star/joint-star-viewport.ts";
import {
  type DrawnStarEdge,
  drawEdge,
  type EdgeContext,
  jointTypeText,
  MARKS_DROP,
} from "./joint-star-draw-edges.ts";
import { frame, nodeShape, toggleMark } from "./joint-star-draw-shapes.ts";
import { svgElement } from "./svg-dom.ts";

// The joint tree as SVG, edges under nodes (ADR 0059). Nothing here is scaled:
// `project` moves every node, edge and mark to its screen position, so texts and
// glyphs keep their size whatever the zoom. The selection is applied later, in
// place, by the view.

export interface DrawnStar {
  svg: SVGElement;
  nodes: ReadonlyMap<string, DrawnStarNode>;
  // By the id of the child node.
  edges: ReadonlyMap<string, DrawnStarEdge>;
  // The nodes, by id, for the roving keyboard focus.
  focusables: ReadonlyMap<string, SVGElement>;
  /** Moves everything to where the viewport puts it. */
  project(viewport: StarViewport): void;
}

interface DrawnStarNode {
  group: SVGElement;
  label: SVGElement;
  // The same shape grown to hold the whole name, above the nodes and edges, shown while the node
  // is selected; null when the name is not cut. The shape stays short in its column so that the
  // next column's shapes never hide it.
  fullLabelOnTop: SVGElement | null;
  placed: PlacedNode;
}

interface DrawContext extends EdgeContext {
  parentEdges: ReadonlyMap<string, PlacedEdge>;
}

function nodeLabelElement(node: PlacedNode, text: string): SVGElement {
  return svgElement(
    "text",
    {
      class: `joint-star-node__label${node.kind === "world" ? " joint-star-node__ground-text" : ""}`,
      x: node.labelOffset,
      y: (node.kind === "world" ? WORLD_LABEL_DROP : 0) + 4,
      "text-anchor": "start",
    },
    [text],
  );
}

function nodeAccessibleName(node: PlacedNode, context: DrawContext): string {
  const { translate } = context;
  const name = context.nodeLabels.get(node.id) ?? node.label;
  const parts: string[] =
    node.kind === "world"
      ? [translate("jointStar.node.world")]
      : [
          translate(node.kind === "group" ? "jointStar.node.group" : "jointStar.node.body", {
            name,
          }),
        ];
  if (node.followingBodyCount > 0) {
    parts.push(translate("jointStar.node.followers", { count: node.followingBodyCount }));
  }
  const edge = context.parentEdges.get(node.id);
  if (edge?.kind === "joint") {
    parts.push(
      translate("jointStar.node.viaJoint", {
        joint: edge.jointName ?? "",
        type: jointTypeText(edge, translate),
      }),
    );
  } else if (edge !== undefined) {
    parts.push(
      translate(edge.kind === "anchor" ? "jointStar.node.anchored" : "jointStar.node.follows"),
    );
  }
  return parts.join(", ");
}

function fullLabelOnTop(
  node: PlacedNode,
  fullLabel: string,
  translate: Translate,
): SVGElement | null {
  if (node.kind === "world" || fullLabel === node.shortLabel) {
    return null;
  }
  return svgElement("g", { class: "joint-star-node__top", "aria-hidden": "true" }, [
    frame(node, node.fullWidth, 0, "joint-star-node__backing"),
    frame(node, node.fullWidth, 0, "joint-star-node__shape joint-star-node__shape--top"),
    ...(node.hasToggle ? [toggleMark(node, translate, false)] : []),
    nodeLabelElement(node, fullLabel),
  ]);
}

function drawNode(node: PlacedNode, context: DrawContext): DrawnStarNode {
  const name = nodeAccessibleName(node, context);
  const fullLabel = context.nodeLabels.get(node.id) ?? node.label;
  const shortLabel = node.kind === "world" ? fullLabel : node.shortLabel;
  const label = nodeLabelElement(node, shortLabel);
  const group = svgElement(
    "g",
    {
      class: `joint-star-node joint-star-node--${node.kind}`,
      role: "button",
      tabindex: -1,
      "aria-label": name,
      "data-node-id": node.id,
      "data-focus": node.id,
    },
    [
      svgElement("title", {}, [name]),
      ...nodeShape(node),
      ...(node.hasToggle ? [toggleMark(node, context.translate, true)] : []),
      label,
    ],
  );
  return {
    group,
    label,
    fullLabelOnTop: fullLabelOnTop(node, fullLabel, context.translate),
    placed: node,
  };
}

function projectAll(
  nodes: ReadonlyMap<string, DrawnStarNode>,
  edges: ReadonlyMap<string, DrawnStarEdge>,
  viewport: StarViewport,
): void {
  for (const { group, fullLabelOnTop: onTop, placed } of nodes.values()) {
    const at = toScreen(viewport, placed);
    const transform = `translate(${at.x} ${at.y})`;
    group.setAttribute("transform", transform);
    onTop?.setAttribute("transform", transform);
  }
  for (const edge of edges.values()) {
    const { path, marksAt, marksSide } = projectEdge(viewport, edge.parent, edge.child);
    for (const curve of edge.curves) {
      curve.setAttribute("d", path);
    }
    edge.marks?.setAttribute(
      "transform",
      `translate(${marksAt.x} ${marksAt.y + marksSide * MARKS_DROP})`,
    );
  }
}

function rootSvg(
  translate: Translate,
  edges: readonly DrawnStarEdge[],
  nodes: readonly DrawnStarNode[],
): SVGElement {
  return svgElement(
    "svg",
    {
      class: "joint-star__svg",
      role: "application",
      "aria-roledescription": translate("jointStar.roleDescription"),
      "aria-label": translate("jointStar.label"),
      "aria-describedby": "joint-star-help",
    },
    [
      svgElement(
        "g",
        { class: "joint-star__edges" },
        edges.map((edge) => edge.group),
      ),
      svgElement(
        "g",
        { class: "joint-star__nodes" },
        nodes.map((node) => node.group),
      ),
      svgElement(
        "g",
        { class: "joint-star__top" },
        nodes.flatMap((node) => (node.fullLabelOnTop === null ? [] : [node.fullLabelOnTop])),
      ),
    ],
  );
}

function drawContextOf(layout: StarLayout, translate: Translate): DrawContext {
  return {
    translate,
    nodeLabels: new Map(
      layout.nodes.map((node) => [
        node.id,
        node.kind === "world" ? translate("jointStar.world") : node.label,
      ]),
    ),
    parentEdges: new Map(layout.edges.map((edge) => [edge.childId, edge])),
  };
}

/** The whole tree: edges first so that nodes cover their ends. */
export function drawJointStar(layout: StarLayout, translate: Translate): DrawnStar {
  const placedById = new Map(layout.nodes.map((node) => [node.id, node]));
  const context = drawContextOf(layout, translate);
  const nodes = new Map(layout.nodes.map((node) => [node.id, drawNode(node, context)]));
  const edges = new Map<string, DrawnStarEdge>();
  for (const edge of layout.edges) {
    const parent = placedById.get(edge.parentId);
    const child = placedById.get(edge.childId);
    if (parent !== undefined && child !== undefined) {
      edges.set(edge.childId, drawEdge(edge, parent, child, context));
    }
  }
  const svg = rootSvg(translate, [...edges.values()], [...nodes.values()]);
  const focusables = new Map([...nodes].map(([id, node]) => [id, node.group]));
  return {
    svg,
    nodes,
    edges,
    focusables,
    project: (viewport) => projectAll(nodes, edges, viewport),
  };
}
