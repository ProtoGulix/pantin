import {
  curvePath,
  type PlacedNode,
  type Point,
  pointOnCurve,
  type StarLayout,
} from "./joint-star-layout.ts";

// Zoom and pan of the joint view (ADR 0059 point 6) as a pure transform, kept in
// memory and never saved. It moves positions only: texts, glyphs and shapes keep
// their screen size, so the drawing projects every anchor instead of scaling a
// group. Distances follow the zoom along each axis on their own, from the squeeze
// at which labels of adjacent columns or rows would touch (given by the layout) up to
// MAX_SCALE: zooming in gives room back, zooming out stops at the limit.

export interface StarViewport {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

export interface ScaleLimits {
  minScaleX: number;
  minScaleY: number;
}

interface Size {
  width: number;
  height: number;
}

export const MAX_SCALE = 4;
// One wheel notch (deltaY of 100) changes the scale by this factor.
const ZOOM_PER_NOTCH = 1.1;
const FIT_MARGIN = 24;
const REVEAL_MARGIN = 40;
// How far along the curve, from the parent, the marks of a joint sit.
const MARKS_FRACTION = 0.8;
// Half a row of text, above and below the first and the last row.
const ROW_HALF_HEIGHT = 12;

export const IDENTITY_LIMITS: ScaleLimits = { minScaleX: 1, minScaleY: 1 };

export const IDENTITY_VIEWPORT: StarViewport = {
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
};

function clamp(value: number, least: number, most: number): number {
  return Math.min(most, Math.max(least, value));
}

export function toScreen(viewport: StarViewport, world: Point): Point {
  return {
    x: world.x * viewport.scaleX + viewport.translateX,
    y: world.y * viewport.scaleY + viewport.translateY,
  };
}

export function toWorld(viewport: StarViewport, screen: Point): Point {
  return {
    x: (screen.x - viewport.translateX) / viewport.scaleX,
    y: (screen.y - viewport.translateY) / viewport.scaleY,
  };
}

/** Zooms by `factor` keeping the world point under `screenPoint` where it is. */
export function zoomAround(
  viewport: StarViewport,
  screenPoint: Point,
  factor: number,
  limits: ScaleLimits,
): StarViewport {
  const world = toWorld(viewport, screenPoint);
  const scaleX = clamp(viewport.scaleX * factor, limits.minScaleX, MAX_SCALE);
  const scaleY = clamp(viewport.scaleY * factor, limits.minScaleY, MAX_SCALE);
  return {
    scaleX,
    scaleY,
    translateX: screenPoint.x - world.x * scaleX,
    translateY: screenPoint.y - world.y * scaleY,
  };
}

/** The zoom factor of a wheel event: scrolling up (negative deltaY) zooms in. */
export function wheelZoomFactor(deltaY: number): number {
  return ZOOM_PER_NOTCH ** (-deltaY / 100);
}

export function pan(viewport: StarViewport, deltaX: number, deltaY: number): StarViewport {
  return {
    ...viewport,
    translateX: viewport.translateX + deltaX,
    translateY: viewport.translateY + deltaY,
  };
}

// The largest scale along x at which every label still ends inside the area.
function widthScale(layout: StarLayout, available: number): number {
  const leftPad = -layout.bounds.minX;
  let scale = Infinity;
  for (const node of layout.nodes) {
    if (node.x > 0) {
      scale = Math.min(scale, (available - leftPad - node.width) / node.x);
    }
  }
  return scale;
}

function heightScale(layout: StarLayout, available: number): number {
  const lastRowY = layout.bounds.maxY - ROW_HALF_HEIGHT;
  return lastRowY > 0 ? (available - 2 * ROW_HALF_HEIGHT) / lastRowY : Infinity;
}

/**
 * The initial view, and "Ajuster": the whole tree, squeezed along each axis only down to the
 * layout's limit. Past the limit the tree does not fit: it stays at the limit and starts at
 * the top left, and the user pans. World sits at the left; a tree that fits is centred
 * vertically. Never larger than natural size.
 */
export function fitToLayout(layout: StarLayout, screen: Size, margin = FIT_MARGIN): StarViewport {
  const fittingScaleX = widthScale(layout, screen.width - 2 * margin);
  const scaleX = clamp(fittingScaleX, layout.minScaleX, 1);
  const scaleY = clamp(heightScale(layout, screen.height - 2 * margin), layout.minScaleY, 1);
  const boxHeight = (layout.bounds.maxY - layout.bounds.minY) * scaleY;
  const spare = screen.height - boxHeight;
  // A tree wider than the area starts at the top too, so that it always begins at the top left.
  const top = spare > 2 * margin && fittingScaleX >= layout.minScaleX ? spare / 2 : margin;
  return {
    scaleX,
    scaleY,
    translateX: margin - layout.bounds.minX,
    translateY: top - layout.bounds.minY * scaleY,
  };
}

/** Pans the least that brings a screen point inside the area, with a margin. */
export function panToReveal(
  viewport: StarViewport,
  screenPoint: Point,
  screen: Size,
  margin = REVEAL_MARGIN,
): StarViewport {
  const shift = (value: number, size: number) => {
    if (value < margin) {
      return margin - value;
    }
    return value > size - margin ? size - margin - value : 0;
  };
  return pan(viewport, shift(screenPoint.x, screen.width), shift(screenPoint.y, screen.height));
}

/** Where a node sits on screen. */
export function projectNode(viewport: StarViewport, node: PlacedNode): Point {
  return toScreen(viewport, node);
}

export interface ProjectedEdge {
  from: Point;
  to: Point;
  // Where the joint's marks hang: near the child's end, so that the marks of the many joints
  // of one parent each stay by their own child instead of piling up under the curve.
  marksAt: Point;
  // Which side of the line they hang on: away from the curve, which arrives from the parent's row.
  marksSide: 1 | -1;
  path: string;
}

/**
 * An edge in screen pixels: it leaves the right edge of its own parent's shape and
 * reaches the left edge of the child's, both measured in pixels, not scaled.
 */
export function projectEdge(
  viewport: StarViewport,
  parent: PlacedNode,
  child: PlacedNode,
): ProjectedEdge {
  const parentAt = toScreen(viewport, parent);
  const childAt = toScreen(viewport, child);
  const from = { x: parentAt.x + parent.width, y: parentAt.y };
  const to = { x: childAt.x, y: childAt.y };
  return {
    from,
    to,
    marksAt: pointOnCurve(from, to, MARKS_FRACTION),
    marksSide: from.y > to.y ? -1 : 1,
    path: curvePath(from, to),
  };
}
