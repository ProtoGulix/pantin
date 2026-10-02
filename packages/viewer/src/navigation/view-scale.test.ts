import { describe, expect, it } from "vitest";
import { cameraDistance, clipPlanes, framedView, panningSensibility } from "./view-scale.ts";
import { visibleHalfHeight } from "./zoom-math.ts";

const fieldOfView = 0.8;

describe("framedView", () => {
  it("shows what the framing distance shows, with limits around it", () => {
    const framed = framedView(10, fieldOfView);
    expect(framed.halfHeight).toBeCloseTo(visibleHalfHeight(10, fieldOfView));
    expect(framed.minHalfHeight).toBeCloseTo(framed.halfHeight / 100);
    expect(framed.maxHalfHeight).toBeCloseTo(framed.halfHeight * 5);
  });

  it("keeps an orthographic camera outside the scene's sphere", () => {
    const framed = framedView(10, fieldOfView);
    expect(framed.orthographicDistance).toBeGreaterThan(framed.sceneRadius);
  });
});

describe("cameraDistance", () => {
  it("does not move an orthographic camera when the zoom changes", () => {
    expect(cameraDistance(false, 1, fieldOfView, 10)).toBe(10);
    expect(cameraDistance(false, 40, fieldOfView, 10)).toBe(10);
  });

  it("puts a perspective camera where it shows the same half height", () => {
    const distance = cameraDistance(true, 3, fieldOfView, 10);
    expect(visibleHalfHeight(distance, fieldOfView)).toBeCloseTo(3);
  });
});

describe("clipPlanes", () => {
  it("covers the scene in front of and behind the target", () => {
    const { minZ, maxZ } = clipPlanes(10, 3);
    expect(minZ).toBeGreaterThan(0);
    expect(minZ).toBeLessThan(10 - 3);
    expect(maxZ).toBeGreaterThan(10 + 3);
  });

  it("keeps the far plane beyond the scene when zoomed right in", () => {
    expect(clipPlanes(0.1, 3).maxZ).toBeGreaterThan(3);
  });
});

describe("panningSensibility", () => {
  it("makes a drag of the canvas height move the view by twice the half height", () => {
    expect(panningSensibility(800, 2)).toBe(200);
    expect(800 / panningSensibility(800, 2)).toBe(4);
  });

  it("asks for more pixels per world unit when zoomed in", () => {
    expect(panningSensibility(800, 1)).toBeGreaterThan(panningSensibility(800, 4));
  });
});
