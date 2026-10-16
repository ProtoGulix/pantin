import { describe, expect, it } from "vitest";
import { boxesOverlap, type OrientedBox } from "./box-overlap.ts";
import { axisAngleRotation } from "./rigid-transform.ts";

const box = (x: number, y = 0, z = 0.1): OrientedBox => ({
  centre: [x, y, z],
  rotation: [0, 0, 0, 1],
  size: [0.4, 0.2, 0.2],
});

describe("boxesOverlap", () => {
  it("detects overlap and separation along each axis", () => {
    expect(boxesOverlap(box(0), box(0.39))).toBe(true);
    expect(boxesOverlap(box(0), box(0.41))).toBe(false);
    expect(boxesOverlap(box(0), box(0, 0.19))).toBe(true);
    expect(boxesOverlap(box(0), box(0, 0, 0.29))).toBe(true);
    expect(boxesOverlap(box(0), box(0, 0, 0.31))).toBe(false);
  });

  it("does not count boxes that touch face to face", () => {
    expect(boxesOverlap(box(0), box(0.4))).toBe(false);
    expect(boxesOverlap(box(0), box(0, 0, 0.3))).toBe(false);
  });

  it("handles rotated boxes, including the edge-edge case", () => {
    const quarter = axisAngleRotation([0, 0, 1], Math.PI / 2);
    // Turned a quarter turn, the 0.4 m side lies along Y: 0.3 m apart in Y overlaps.
    expect(boxesOverlap(box(0), { ...box(0, 0.25), rotation: quarter })).toBe(true);
    expect(boxesOverlap(box(0), { ...box(0.31, 0.5), rotation: quarter })).toBe(false);
    // At 45 degrees the turned box reaches (0.4 + 0.2) / 2 / sqrt(2) along X.
    const diagonal = axisAngleRotation([0, 0, 1], Math.PI / 4);
    const reach = (0.4 + 0.2) / 2 / Math.SQRT2 + 0.2;
    expect(boxesOverlap(box(0), { ...box(reach - 0.01), rotation: diagonal })).toBe(true);
    expect(boxesOverlap(box(0), { ...box(reach + 0.01), rotation: diagonal })).toBe(false);
  });

  it("separates by an edge-edge axis alone", () => {
    // Two unit cubes, one turned 45 degrees about X and one about Y, one above
    // the other: no face axis separates them, only the crossing edges do (the
    // edges meet at 2 x sqrt(2) / 2 = 1.414 m).
    const cube = (z: number, axis: [number, number, number]): OrientedBox => ({
      centre: [0, 0, z],
      rotation: axisAngleRotation(axis, Math.PI / 4),
      size: [1, 1, 1],
    });
    expect(boxesOverlap(cube(0, [1, 0, 0]), cube(1.3, [0, 1, 0]))).toBe(true);
    expect(boxesOverlap(cube(0, [1, 0, 0]), cube(1.5, [0, 1, 0]))).toBe(false);
  });

  it("stays exact for boxes yawed by a tiny angle", () => {
    // A 0.2 m cube yawed a hair under a flat box 0.2 m thick: nearly parallel
    // edges must not hide the overlap (edge axes are normalised).
    const flat: OrientedBox = {
      centre: [0, 0, 0.1],
      rotation: [0, 0, 0, 1],
      size: [0.2, 0.2, 0.2],
    };
    for (const yaw of [0, 5e-6, 1e-5, 3e-5, 1e-3]) {
      const turned = (z: number): OrientedBox => ({
        centre: [0, 0, z],
        rotation: axisAngleRotation([0, 0, 1], yaw),
        size: [0.2, 0.2, 0.2],
      });
      expect(boxesOverlap(flat, turned(0.1 + 0.15))).toBe(true);
      expect(boxesOverlap(flat, turned(0.1 + 0.199))).toBe(true);
      // Exactly face to face: touching, not overlapping.
      expect(boxesOverlap(flat, turned(0.1 + 0.2))).toBe(false);
      expect(boxesOverlap(flat, turned(0.1 + 0.201))).toBe(false);
    }
  });
});
