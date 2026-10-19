import { describe, expect, it } from "vitest";
import { scieFixture, starDocument } from "./joint-star-fixtures.ts";
import { buildJointStarForest } from "./joint-star-forest.ts";
import { layoutJointStar } from "./joint-star-layout.ts";
import {
  fitToLayout,
  IDENTITY_VIEWPORT,
  MAX_SCALE,
  pan,
  panToReveal,
  projectEdge,
  projectNode,
  type StarViewport,
  toScreen,
  toWorld,
  wheelZoomFactor,
  zoomAround,
} from "./joint-star-viewport.ts";

const limits = { minScaleX: 0.8, minScaleY: 0.7 };

describe("joint star viewport transform", () => {
  it("converts both ways, each axis at its own scale", () => {
    const viewport = { scaleX: 2, scaleY: 0.5, translateX: 10, translateY: -5 };
    expect(toScreen(viewport, { x: 3, y: 40 })).toEqual({ x: 16, y: 15 });
    expect(toWorld(viewport, { x: 16, y: 15 })).toEqual({ x: 3, y: 40 });
  });

  it("keeps the point under the pointer fixed when zooming, in and out", () => {
    for (const start of [
      { scaleX: 1.5, scaleY: 1.5, translateX: 30, translateY: 20 },
      { scaleX: 0.9, scaleY: 0.8, translateX: 30, translateY: 20 },
    ]) {
      const pointer = { x: 200, y: 120 };
      const worldBefore = toWorld(start, pointer);
      for (const factor of [1.3, 0.95]) {
        const worldAfter = toWorld(zoomAround(start, pointer, factor, limits), pointer);
        expect(worldAfter.x).toBeCloseTo(worldBefore.x);
        expect(worldAfter.y).toBeCloseTo(worldBefore.y);
      }
    }
  });

  it("stops zooming out at the limit of each axis and zooming in at the maximum", () => {
    const out = zoomAround(IDENTITY_VIEWPORT, { x: 0, y: 0 }, 0.0001, limits);
    expect([out.scaleX, out.scaleY]).toEqual([0.8, 0.7]);
    const far = zoomAround(IDENTITY_VIEWPORT, { x: 0, y: 0 }, 1000, limits);
    expect([far.scaleX, far.scaleY]).toEqual([MAX_SCALE, MAX_SCALE]);
  });

  it("zooms in on wheel up and out on wheel down", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it("pans without changing the scale", () => {
    const viewport = { scaleX: 2, scaleY: 2, translateX: 1, translateY: 2 };
    expect(pan(viewport, 5, -3)).toEqual({ ...viewport, translateX: 6, translateY: -1 });
  });
});

describe("joint star viewport fit and reveal", () => {
  const fixture = scieFixture();
  const unfolded = new Set(fixture.assemblies.map((key) => `assembly:${key}`));
  const layout = layoutJointStar(buildJointStarForest(starDocument(fixture), unfolded));
  const rightEnd = (viewport: StarViewport) =>
    Math.max(...layout.nodes.map((node) => toScreen(viewport, node).x + node.width));

  it("leaves a tree that fits at natural size, World at the left", () => {
    const viewport = fitToLayout(layout, { width: 4000, height: 4000 });
    expect([viewport.scaleX, viewport.scaleY]).toEqual([1, 1]);
    expect(toScreen(viewport, { x: layout.bounds.minX, y: 0 }).x).toBe(24);
  });

  it("squeezes a tree that does not fit until it does, never below the limits", () => {
    const natural = rightEnd({ ...IDENTITY_VIEWPORT, translateX: 24 - layout.bounds.minX });
    const width = natural - 40;
    const viewport = fitToLayout(layout, { width, height: 4000 });
    expect(viewport.scaleX).toBeLessThan(1);
    expect(viewport.scaleX).toBeGreaterThanOrEqual(layout.minScaleX);
    expect(rightEnd(viewport)).toBeLessThanOrEqual(width - 24 + 0.001);
  });

  it("stays at the limit and starts at the top left when even that does not fit", () => {
    const viewport = fitToLayout(layout, { width: 60, height: 40 });
    expect(viewport.scaleX).toBe(layout.minScaleX);
    expect(viewport.scaleY).toBe(layout.minScaleY);
    expect(toScreen(viewport, { x: layout.bounds.minX, y: layout.bounds.minY }).x).toBe(24);
    expect(toScreen(viewport, { x: 0, y: layout.bounds.minY }).y).toBe(24);
  });

  it("has limits that keep labels of adjacent columns apart", () => {
    expect(layout.minScaleX).toBeGreaterThan(0);
    expect(layout.minScaleX).toBeLessThan(1);
    expect(layout.minScaleY).toBeLessThan(1);
  });

  it("pans the least to bring a point back inside the area", () => {
    const screen = { width: 800, height: 400 };
    expect(panToReveal(IDENTITY_VIEWPORT, { x: 100, y: 100 }, screen)).toEqual(IDENTITY_VIEWPORT);
    const moved = panToReveal(IDENTITY_VIEWPORT, { x: 790, y: -20 }, screen, 40);
    expect(moved.translateX).toBe(-30);
    expect(moved.translateY).toBe(60);
  });
});

describe("joint star projection", () => {
  const layout = layoutJointStar(buildJointStarForest(starDocument(scieFixture())));
  const [world, first] = layout.nodes;

  it("moves anchors with the viewport and leaves sizes alone", () => {
    if (world === undefined || first === undefined) {
      throw new Error("fixture has no node");
    }
    const viewport = { scaleX: 2, scaleY: 3, translateX: 7, translateY: 9 };
    expect(projectNode(viewport, first)).toEqual(toScreen(viewport, first));
    const edge = projectEdge(viewport, world, first);
    expect(edge.from.x).toBe(world.x * 2 + 7 + world.width);
    expect(edge.to.x).toBe(first.x * 2 + 7);
    expect(edge.marksAt.x).toBeGreaterThan(edge.from.x);
    expect(edge.marksAt.x).toBeLessThan(edge.to.x);
    expect(edge.path.startsWith(`M ${edge.from.x} ${edge.from.y} C`)).toBe(true);
  });
});
