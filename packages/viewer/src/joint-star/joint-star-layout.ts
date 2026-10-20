import type { JointType } from "@pantin/protocol";
import type { StarEdgeKind, StarNode, StarNodeKind } from "./joint-star-forest.ts";

// The horizontal tree layout of the joint view (ADR 0059 point 4, amendment of
// 2026-10-19): pure geometry in pixels at zoom 1, y down. World is on the left,
// one column per depth, the children of a node stacked top to bottom in forest
// order and the node centred on them. No stored positions, so the same document
// always gives the same picture.
//
// Positions are anchors: the drawing keeps its texts, glyphs and shapes at their
// own size and only moves them, so every width below is a distance in pixels. A node's
// anchor is the left edge of its shape (the centre of the circle for World, whose name
// hangs under it); the name is inside the shape, which is as wide as it needs. An edge
// leaves the right edge of its own parent and reaches the left edge of its child.

// The distance between two rows at zoom 1, and the least one the view squeezes them to:
// a line of text, its room, and the name of a joint that hangs under a curve.
export const ROW_PITCH = 30;
const TIGHT_ROW_PITCH = 22;
export const LABEL_MAX_CHARACTERS = 16;
export const JOINT_NAME_MAX_CHARACTERS = 10;
export const LABEL_ELLIPSIS = "…";
// Estimates: the real width comes from the font. They size the shapes, with the padding as a margin
// of error; the selected node's name is bold, hence wider.
const CHARACTER_WIDTH = 6.2;
const BOLD_CHARACTER_WIDTH = 6.8;
const WORLD_LABEL_CHARACTERS = 6;
const SHAPE_PADDING = 8;
// Room of the fold chevron and of the count of following bodies, at the left inside a shape.
export const TOGGLE_WIDTH = 30;
// The curve between a column's shapes: its length at zoom 1, and the least the view squeezes it
// to. The joint name hangs near the child's end of the curve and reserves nothing.
const EDGE_RUN = 64;
const TIGHT_EDGE_RUN = 40;
const MARGIN = 12;

export const WORLD_HALF_WIDTH = 15;
// Under the circle of World: the gap to its name, then the name's own line.
export const WORLD_LABEL_DROP = WORLD_HALF_WIDTH + 14;

export interface Point {
  x: number;
  y: number;
}

export interface PlacedNode {
  id: string;
  kind: StarNodeKind;
  label: string;
  // Cut to LABEL_MAX_CHARACTERS; the view shows `label` for the selected node.
  shortLabel: string;
  followingBodyCount: number;
  unfolded: boolean;
  isFollowingLeaf: boolean;
  // Worth a fold chevron: a group or World with bodies that follow it.
  hasToggle: boolean;
  depth: number;
  // The left edge of the shape, and the middle of its row.
  x: number;
  y: number;
  // The shape's width: its right edge, where the edges to the children start, is x + width.
  width: number;
  // The width with the whole name, for the selected node; equals width when the name is not cut.
  fullWidth: number;
  // From x to the fold chevron, then to the start of the name past the chevron and the count.
  toggleOffset: number;
  labelOffset: number;
}

export interface PlacedEdge {
  kind: StarEdgeKind;
  parentId: string;
  childId: string;
  jointId: string | undefined;
  jointType: JointType | undefined;
  jointName: string | undefined;
  driven: boolean;
  watched: boolean;
}

interface StarBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface StarLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  bounds: StarBounds;
  // How far the view may squeeze the distances, along x and along y, before the labels of
  // adjacent columns or rows touch. Between 0 and 1.
  minScaleX: number;
  minScaleY: number;
}

export function shortenLabel(label: string, maxCharacters = LABEL_MAX_CHARACTERS): string {
  const characters = [...label];
  if (characters.length <= maxCharacters) {
    return label;
  }
  return characters.slice(0, maxCharacters - 1).join("") + LABEL_ELLIPSIS;
}

interface Slot {
  node: StarNode;
  parent: StarNode | undefined;
  edgeIndex: number;
  depth: number;
  row: number;
}

function hasToggle(node: StarNode): boolean {
  return node.kind !== "body" && node.followingBodyCount > 0;
}

// Leaves take the next free row; a parent sits halfway between its first and last child.
// Two nodes of one column belong to different subtrees, whose leaves do not share a row,
// so they are at least one pitch apart.
function collectSlots(
  node: StarNode,
  context: { parent: StarNode | undefined; edgeIndex: number; depth: number },
  nextRow: { value: number },
  slots: Slot[],
): number {
  const slot: Slot = { node, ...context, row: 0 };
  slots.push(slot);
  if (node.edges.length === 0) {
    slot.row = nextRow.value;
    nextRow.value += 1;
    return slot.row;
  }
  const rows = node.edges.map((edge, index) =>
    collectSlots(
      edge.child,
      { parent: node, edgeIndex: index, depth: context.depth + 1 },
      nextRow,
      slots,
    ),
  );
  slot.row = ((rows[0] ?? 0) + (rows[rows.length - 1] ?? 0)) / 2;
  return slot.row;
}

function shapeWidth(node: StarNode, label: string, characterWidth: number): number {
  if (node.kind === "world") {
    return 2 * WORLD_HALF_WIDTH;
  }
  const textWidth = [...label].length * characterWidth;
  return SHAPE_PADDING + (hasToggle(node) ? TOGGLE_WIDTH : 0) + textWidth + SHAPE_PADDING;
}

// World's name and toggle share a line under the circle: its width, centred on the circle.
function worldLineWidth(node: StarNode): number {
  return (hasToggle(node) ? TOGGLE_WIDTH : 0) + WORLD_LABEL_CHARACTERS * CHARACTER_WIDTH;
}

// How far World's line sticks out left of the circle.
function worldOverhang(node: StarNode): number {
  return Math.max(0, worldLineWidth(node) / 2 - WORLD_HALF_WIDTH);
}

function toggleOffsetOf(node: StarNode): number {
  return node.kind === "world" ? WORLD_HALF_WIDTH - worldLineWidth(node) / 2 : SHAPE_PADDING;
}

function labelOffsetOf(node: StarNode): number {
  return toggleOffsetOf(node) + (hasToggle(node) ? TOGGLE_WIDTH : 0);
}

// The widest shape of each column.
function columnWidths(slots: readonly Slot[]): number[] {
  const widths: number[] = [];
  for (const { node, depth } of slots) {
    widths[depth] = Math.max(
      widths[depth] ?? 0,
      shapeWidth(node, shortenLabel(node.label), CHARACTER_WIDTH),
    );
  }
  return widths;
}

// The x of each column's left edge: the previous column's widest shape, then the run of the curve.
function columnPositions(widths: readonly number[], firstX: number): number[] {
  const positions: number[] = [];
  widths.forEach((_width, depth) => {
    const previousX = positions[depth - 1];
    positions.push(
      previousX === undefined ? firstX : previousX + (widths[depth - 1] ?? 0) + EDGE_RUN,
    );
  });
  return positions;
}

// The squeeze at which the curve of the widest column shrinks to its least run: the width of
// the shapes stays, only the distance between the left edges follows the zoom.
function minScaleXOf(widths: readonly number[]): number {
  let limit = 0;
  for (let depth = 0; depth + 1 < widths.length; depth += 1) {
    const fixed = widths[depth] ?? 0;
    limit = Math.max(limit, (fixed + TIGHT_EDGE_RUN) / (fixed + EDGE_RUN));
  }
  return limit;
}

function place(slot: Slot, positions: readonly number[]): PlacedNode {
  const { node, depth } = slot;
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    shortLabel: shortenLabel(node.label),
    followingBodyCount: node.followingBodyCount,
    unfolded: node.unfolded,
    isFollowingLeaf: node.isFollowingLeaf,
    hasToggle: hasToggle(node),
    depth,
    x: positions[depth] ?? 0,
    y: slot.row * ROW_PITCH,
    width: shapeWidth(node, shortenLabel(node.label), CHARACTER_WIDTH),
    fullWidth: shapeWidth(node, node.label, BOLD_CHARACTER_WIDTH),
    toggleOffset: toggleOffsetOf(node),
    labelOffset: labelOffsetOf(node),
  };
}

function placeEdges(slots: readonly Slot[]): PlacedEdge[] {
  const edges: PlacedEdge[] = [];
  for (const slot of slots) {
    const edge = slot.parent?.edges[slot.edgeIndex];
    if (slot.parent === undefined || edge === undefined) {
      continue;
    }
    edges.push({
      kind: edge.kind,
      parentId: slot.parent.id,
      childId: slot.node.id,
      jointId: edge.jointId,
      jointType: edge.jointType,
      jointName: edge.jointName,
      driven: edge.driven,
      watched: edge.watched,
    });
  }
  return edges;
}

function boundsOf(nodes: readonly PlacedNode[]): StarBounds {
  // World's line sticks out of its circle by at most the first column's x: the box starts at 0.
  const bounds = { minX: 0, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const node of nodes) {
    bounds.maxX = Math.max(bounds.maxX, node.x + node.width);
    bounds.minY = Math.min(bounds.minY, node.y - MARGIN);
    bounds.maxY = Math.max(
      bounds.maxY,
      node.y + (node.kind === "world" ? WORLD_LABEL_DROP : 0) + MARGIN,
    );
  }
  return bounds;
}

/** The SVG path of an edge: a cubic curve with horizontal tangents at both ends, in screen pixels. */
export function curvePath(from: Point, to: Point): string {
  const middleX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${middleX} ${from.y}, ${middleX} ${to.y}, ${to.x} ${to.y}`;
}

/** The point of the curve of `curvePath` at `fraction` (0 at `from`, 1 at `to`). */
export function pointOnCurve(from: Point, to: Point, fraction: number): Point {
  const middleX = (from.x + to.x) / 2;
  const rest = 1 - fraction;
  const w0 = rest ** 3;
  const w1 = 3 * rest * rest * fraction;
  const w2 = 3 * rest * fraction * fraction;
  const w3 = fraction ** 3;
  return {
    x: w0 * from.x + (w1 + w2) * middleX + w3 * to.x,
    y: (w0 + w1) * from.y + (w2 + w3) * to.y,
  };
}

/** Places a forest rooted at World: World at the left, depth d in column d. */
export function layoutJointStar(root: StarNode): StarLayout {
  const slots: Slot[] = [];
  collectSlots(root, { parent: undefined, edgeIndex: 0, depth: 0 }, { value: 0 }, slots);
  const widths = columnWidths(slots);
  const positions = columnPositions(widths, worldOverhang(root));
  const nodes = slots.map((slot) => place(slot, positions));
  return {
    nodes,
    edges: placeEdges(slots),
    bounds: boundsOf(nodes),
    minScaleX: minScaleXOf(widths),
    minScaleY: TIGHT_ROW_PITCH / ROW_PITCH,
  };
}
