import { describe, expect, it } from "vitest";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import { toggleInspector } from "./drive-actions.ts";

describe("remembered inspector layout", () => {
  it("stores the open state at each toggle", () => {
    const stored: boolean[] = [];
    const store = testStore({}, {}, undefined, {
      storeInspectorOpen: (open) => stored.push(open),
    });
    toggleInspector(store);
    toggleInspector(store);
    expect(stored).toEqual([false, true]);
  });

  it("stores the folded groups when a group is folded", () => {
    const stored: ReadonlySet<string>[] = [];
    const store = testStore({}, {}, undefined, {
      storeCollapsedGroups: (groups) => stored.push(groups),
    });
    createPanelIntents(store).togglePropertyGroup("placement");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.has("placement")).toBe(true);
  });
});
