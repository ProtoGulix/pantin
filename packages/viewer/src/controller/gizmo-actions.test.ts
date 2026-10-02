import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SNAP_STEPS } from "../gizmo/placement-snapping.ts";
import { testStore } from "./controller-test-helpers.ts";
import { setGizmoStep, toggleGizmo } from "./gizmo-actions.ts";

describe("gizmo switches", () => {
  it("turns a gizmo on, switches to the other, and off with the same command", () => {
    const store = testStore({});
    toggleGizmo(store, "move");
    expect(store.state.gizmoMode).toBe("move");
    toggleGizmo(store, "rotate");
    expect(store.state.gizmoMode).toBe("rotate");
    toggleGizmo(store, "rotate");
    expect(store.state.gizmoMode).toBeNull();
  });
});

describe("gizmo steps", () => {
  it("starts from the defaults", () => {
    expect(testStore({}).state.gizmoSteps).toEqual(DEFAULT_SNAP_STEPS);
  });

  it("keeps a typed step in the state and in the browser", () => {
    const stored = vi.fn();
    const store = testStore({}, {}, undefined, { storeGizmoSteps: stored });
    setGizmoStep(store, "rotationDegrees", "5");
    expect(store.state.gizmoSteps).toEqual({ translationMillimetres: 1, rotationDegrees: 5 });
    expect(stored).toHaveBeenCalledWith({ translationMillimetres: 1, rotationDegrees: 5 });
  });

  it("ignores a typed step that is not a positive number", () => {
    const stored = vi.fn();
    const store = testStore({}, {}, undefined, { storeGizmoSteps: stored });
    setGizmoStep(store, "translationMillimetres", "0");
    expect(store.state.gizmoSteps).toEqual(DEFAULT_SNAP_STEPS);
    expect(stored).not.toHaveBeenCalled();
  });
});
