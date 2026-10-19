import { describe, expect, it } from "vitest";
import { edgeLabelAnchor } from "./diagram-edge-label.ts";

describe("edgeLabelAnchor", () => {
  it("lies above a straight wire, a third of the way along", () => {
    const anchor = edgeLabelAnchor([
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]);
    expect(anchor.x).toBeCloseTo(35);
    expect(anchor.y).toBe(46);
  });

  it("follows a wire with stubs and a slant, staying on the wire", () => {
    const anchor = edgeLabelAnchor([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 60, y: 30 },
      { x: 80, y: 30 },
    ]);
    // Total 20 + 50 + 20 = 90; 35% is 31.5, 11.5 into the slant.
    const share = 11.5 / 50;
    expect(anchor.x).toBeCloseTo(20 + 40 * share);
    expect(anchor.y).toBeCloseTo(30 * share - 4);
  });

  it("answers the origin for a wire without points", () => {
    expect(edgeLabelAnchor([])).toEqual({ x: 0, y: 0 });
  });
});
