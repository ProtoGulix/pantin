import { describe, expect, it } from "vitest";
import { matchRing } from "./diagram-match-ring.ts";

describe("the outline of a node that matches the filter", () => {
  it("surrounds the box at a distance, so that it never covers the box's own outline", () => {
    expect(matchRing({ x: 100, y: 50, width: 160, height: 60 })).toEqual({
      x: 96,
      y: 46,
      width: 168,
      height: 68,
      rx: 10,
    });
  });
});
