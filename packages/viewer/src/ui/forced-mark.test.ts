import { describe, expect, it } from "vitest";
import { focusBesideRelease, type RowLike, showForcedMarks } from "./forced-mark.ts";

// The viewer's tests run without a DOM: minimal stand-ins record what is touched.

class FakeItem {
  hidden = true;
  focused = false;
  readonly attributes = new Map<string, string>();
  constructor(attributes: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(attributes)) {
      this.attributes.set(name, value);
    }
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  focus(): void {
    this.focused = true;
  }
}

describe("showForcedMarks", () => {
  it("shows the marks of forced tags and hides the others", () => {
    const marks = [
      new FakeItem({ "data-forced-tag": "a.v.coil_14" }),
      new FakeItem({ "data-forced-tag": "a.v.coil_12" }),
    ];
    showForcedMarks({ querySelectorAll: () => marks }, new Set(["a.v.coil_14"]));
    expect(marks.map((mark) => mark.hidden)).toEqual([false, true]);
    showForcedMarks({ querySelectorAll: () => marks }, new Set());
    expect(marks.map((mark) => mark.hidden)).toEqual([true, true]);
  });
});

function rowOf(controls: FakeItem[], header: FakeItem | null): RowLike {
  return { querySelectorAll: () => controls, querySelector: () => header };
}

describe("focusBesideRelease", () => {
  it("focuses the row's own control, never the release button", () => {
    const release = new FakeItem({ "data-focus-key": "release-a.v.coil_14" });
    const toggle = new FakeItem({ "data-focus-key": "toggle-coil" });
    focusBesideRelease(rowOf([release, toggle], null));
    expect([release.focused, toggle.focused]).toEqual([false, true]);
    expect(toggle.getAttribute("tabindex")).toBeNull();
  });

  it("falls back to the row header, made focusable, when only the release button is there", () => {
    const release = new FakeItem({ "data-focus-key": "release-main.source.spawn" });
    const header = new FakeItem();
    focusBesideRelease(rowOf([release], header));
    expect([release.focused, header.focused]).toEqual([false, true]);
    expect(header.getAttribute("tabindex")).toBe("-1");
  });

  it("does nothing without a row", () => {
    expect(() => focusBesideRelease(null)).not.toThrow();
  });
});
