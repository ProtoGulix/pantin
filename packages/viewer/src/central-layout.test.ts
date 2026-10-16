import { describe, expect, it } from "vitest";
import {
  CENTRAL_LAYOUTS,
  DEFAULT_CENTRAL_LAYOUT,
  effectiveLayout,
  nextLayout,
  parseStoredLayout,
  shouldRender,
  showsDiagram,
  showsIo,
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

describe("central layout, the I/O view", () => {
  it("shows the I/O table alone, with no 3D view, no diagram and no rendering", () => {
    expect([showsIo("io"), showsIo("both"), showsViewport("io"), showsDiagram("io")]).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect([shouldRender("io", true), shouldRender("io", false)]).toEqual([false, true]);
  });

  it("leaves the I/O view out of the F4 cycle, which goes back to both", () => {
    expect(nextLayout("io")).toBe("both");
    expect([nextLayout("both"), nextLayout("3d"), nextLayout("diagram")]).not.toContain("io");
  });
});
