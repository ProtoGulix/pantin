import { describe, expect, it } from "vitest";
import {
  CENTRAL_LAYOUTS,
  DEFAULT_CENTRAL_LAYOUT,
  effectiveLayout,
  nextLayout,
  parseStoredLayout,
  shouldRender,
  showsDiagram,
  showsViewport,
} from "./central-layout.ts";

describe("central layout", () => {
  it("defaults to both", () => {
    expect(DEFAULT_CENTRAL_LAYOUT).toBe("both");
  });

  it("round-trips every layout through its stored text", () => {
    for (const layout of CENTRAL_LAYOUTS) {
      expect(parseStoredLayout(layout)).toBe(layout);
    }
  });

  it("falls back to the default on a missing or corrupt value", () => {
    for (const stored of [null, "", "split", "BOTH", '{"layout":"3d"}']) {
      expect(parseStoredLayout(stored)).toBe("both");
    }
  });

  it("says what each layout shows", () => {
    expect([showsViewport("3d"), showsViewport("diagram"), showsViewport("both")]).toEqual([
      true,
      false,
      true,
    ]);
    expect([showsDiagram("3d"), showsDiagram("diagram"), showsDiagram("both")]).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("cycles through the three layouts and comes back", () => {
    expect(nextLayout("both")).toBe("3d");
    expect(nextLayout("3d")).toBe("diagram");
    expect(nextLayout("diagram")).toBe("both");
  });

  it("gives the 3D view the whole area while no Pantin is open", () => {
    expect(effectiveLayout("both", false)).toBe("3d");
    expect(effectiveLayout("diagram", false)).toBe("3d");
    expect(effectiveLayout("both", true)).toBe("both");
  });

  it("stops the render loop only in the diagram layout", () => {
    expect(shouldRender("3d", true)).toBe(true);
    expect(shouldRender("both", true)).toBe(true);
    expect(shouldRender("diagram", true)).toBe(false);
    expect(shouldRender("diagram", false)).toBe(true);
  });
});
