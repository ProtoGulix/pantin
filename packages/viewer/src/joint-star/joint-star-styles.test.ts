import { describe, expect, it } from "vitest";
import { edgeStyleOf, STAR_EDGE_STYLES } from "./joint-star-styles.ts";

describe("STAR_EDGE_STYLES", () => {
  it("gives each joint type its own line, glyph and class", () => {
    const joints = ["fixed", "prismatic", "revolute", "continuous", "helical"] as const;
    const signatures = joints.map((type) => {
      const style = STAR_EDGE_STYLES[type];
      return `${style.widthPixels}|${style.dashArray}|${style.glyphId}`;
    });
    expect(new Set(signatures).size).toBe(joints.length);
    expect(new Set(joints.map((type) => STAR_EDGE_STYLES[type].cssClass)).size).toBe(joints.length);
  });

  it("labels joint edges and no other edge", () => {
    expect(STAR_EDGE_STYLES.fixed.showsLabel).toBe(true);
    expect(STAR_EDGE_STYLES.follows.showsLabel).toBe(false);
    expect(STAR_EDGE_STYLES.follows.glyphId).toBeNull();
    expect(STAR_EDGE_STYLES.anchor.glyphId).toBe("ground-hatch");
    expect(STAR_EDGE_STYLES.anchor.faint).toBe(true);
  });

  it("looks a style up by joint type or by edge kind", () => {
    expect(edgeStyleOf("joint", "helical")).toBe(STAR_EDGE_STYLES.helical);
    expect(edgeStyleOf("follows", undefined)).toBe(STAR_EDGE_STYLES.follows);
    expect(edgeStyleOf("joint", undefined)).toBe(STAR_EDGE_STYLES.fixed);
  });
});
