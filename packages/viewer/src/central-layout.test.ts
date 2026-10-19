import { describe, expect, it } from "vitest";
import {
  CENTRAL_VIEWS,
  type CentralLayout,
  chooseView,
  closeBottomZone,
  DEFAULT_CENTRAL_LAYOUT,
  effectiveLayout,
  isSplitLayout,
  isViewDisabledIn,
  layoutOf,
  nextTopView,
  openBottomZone,
  parseStoredLayout,
  revealView,
  serialiseLayout,
  shouldRender,
  showsDiagram,
  showsIo,
  showsJointStar,
  showsViewport,
  zoneOfView,
} from "./central-layout.ts";

describe("choosing a view for a zone", () => {
  it("replaces the view of the zone", () => {
    expect(chooseView(layoutOf("3d", "diagram"), "top", "io")).toEqual(layoutOf("io", "diagram"));
    expect(chooseView(layoutOf("3d", "diagram"), "bottom", "joints")).toEqual(
      layoutOf("3d", "joints"),
    );
  });

  it("refuses a view the other zone shows, and leaves the layout as it was", () => {
    const layout = layoutOf("3d", "diagram");
    expect(isViewDisabledIn(layout, "top", "diagram")).toBe(true);
    expect(isViewDisabledIn(layout, "bottom", "3d")).toBe(true);
    expect(isViewDisabledIn(layout, "top", "3d")).toBe(false);
    expect(chooseView(layout, "top", "diagram")).toBe(layout);
    expect(chooseView(layout, "bottom", "3d")).toBe(layout);
  });

  it("disables nothing while the bottom zone is closed", () => {
    expect(CENTRAL_VIEWS.some((view) => isViewDisabledIn(layoutOf("3d"), "top", view))).toBe(false);
  });

  it("reveals a view in the top zone only when no zone shows it", () => {
    const layout = layoutOf("3d", "diagram");
    expect(revealView(layout, "diagram")).toBe(layout);
    expect(revealView(layout, "io")).toEqual(layoutOf("io", "diagram"));
  });
});

describe("the bottom zone", () => {
  it("opens on the first view the top zone does not show", () => {
    expect(openBottomZone(layoutOf("3d"))).toEqual(layoutOf("3d", "diagram"));
    expect(openBottomZone(layoutOf("diagram"))).toEqual(layoutOf("diagram", "3d"));
  });

  it("does nothing when it is already open, and closes keeping the top view", () => {
    const open = layoutOf("io", "joints");
    expect(openBottomZone(open)).toBe(open);
    expect(closeBottomZone(open)).toEqual(layoutOf("io"));
    expect([isSplitLayout(open), isSplitLayout(layoutOf("io"))]).toEqual([true, false]);
  });
});

describe("F4", () => {
  it("goes 3D, diagram, joints, I/O and back with the bottom zone closed", () => {
    const steps: string[] = [];
    let layout: CentralLayout = layoutOf("3d");
    for (let count = 0; count < 5; count += 1) {
      steps.push(layout.top);
      layout = nextTopView(layout);
    }
    expect(steps).toEqual(["3d", "diagram", "joints", "io", "3d"]);
  });

  it("skips the view the bottom zone shows", () => {
    expect(nextTopView(layoutOf("3d", "diagram")).top).toBe("joints");
    expect(nextTopView(layoutOf("io", "3d")).top).toBe("diagram");
    expect(nextTopView(layoutOf("joints", "io"))).toEqual(layoutOf("3d", "io"));
  });
});

describe("what a layout shows", () => {
  it("says which views are in a zone, either one", () => {
    const layout = layoutOf("joints", "3d");
    expect([showsViewport(layout), showsJointStar(layout)]).toEqual([true, true]);
    expect([showsDiagram(layout), showsIo(layout)]).toEqual([false, false]);
  });

  it("places a view in its zone, or in none", () => {
    const layout = layoutOf("joints", "3d");
    expect([zoneOfView(layout, "joints"), zoneOfView(layout, "3d")]).toEqual(["top", "bottom"]);
    expect(zoneOfView(layout, "diagram")).toBe("none");
    expect(zoneOfView(layoutOf("3d"), "io")).toBe("none");
  });

  it("gives the 3D view the whole area while no Pantin is open", () => {
    expect(effectiveLayout(layoutOf("diagram", "io"), false)).toEqual(layoutOf("3d"));
    const layout = layoutOf("diagram", "io");
    expect(effectiveLayout(layout, true)).toBe(layout);
  });

  it("runs the render loop whenever the 3D view shows in a zone", () => {
    expect(shouldRender(layoutOf("3d"), true)).toBe(true);
    expect(shouldRender(layoutOf("diagram", "3d"), true)).toBe(true);
    expect(shouldRender(layoutOf("diagram", "io"), true)).toBe(false);
    expect(shouldRender(layoutOf("diagram", "io"), false)).toBe(true);
  });
});

describe("the stored layout", () => {
  it("defaults to the 3D view over the diagram", () => {
    expect(DEFAULT_CENTRAL_LAYOUT).toEqual(layoutOf("3d", "diagram"));
  });

  it("reads every old value into the new form", () => {
    const old: [string, CentralLayout][] = [
      ["3d", layoutOf("3d")],
      ["diagram", layoutOf("diagram")],
      ["both", layoutOf("3d", "diagram")],
      ["io", layoutOf("io")],
      ["joints", layoutOf("joints")],
      ["3d-joints", layoutOf("3d", "joints")],
    ];
    for (const [text, expected] of old) {
      expect(parseStoredLayout(text)).toEqual(expected);
    }
  });

  it("round-trips every valid layout", () => {
    for (const top of CENTRAL_VIEWS) {
      expect(parseStoredLayout(serialiseLayout(layoutOf(top)))).toEqual(layoutOf(top));
      for (const bottom of CENTRAL_VIEWS.filter((view) => view !== top)) {
        expect(parseStoredLayout(serialiseLayout(layoutOf(top, bottom)))).toEqual(
          layoutOf(top, bottom),
        );
      }
    }
  });

  it("falls back to the default on a missing, corrupt or contradictory value", () => {
    for (const stored of [
      null,
      "",
      "split",
      "BOTH",
      "3d/3d",
      "3d/",
      "3d/nope",
      "3d/io/joints",
      '{"top":"3d"}',
    ]) {
      expect(parseStoredLayout(stored)).toEqual(DEFAULT_CENTRAL_LAYOUT);
    }
  });
});
