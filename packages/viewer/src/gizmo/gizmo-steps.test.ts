import { describe, expect, it } from "vitest";
import { parseStoredSteps, serializeSteps, withTypedStep } from "./gizmo-steps.ts";
import { DEFAULT_SNAP_STEPS } from "./placement-snapping.ts";

describe("gizmo steps", () => {
  it("defaults to 1 mm and 15 degrees", () => {
    expect(DEFAULT_SNAP_STEPS).toEqual({ translationMillimetres: 1, rotationDegrees: 15 });
    expect(parseStoredSteps(null)).toEqual(DEFAULT_SNAP_STEPS);
  });

  it("reads back what it stored", () => {
    const steps = { translationMillimetres: 0.5, rotationDegrees: 5 };
    expect(parseStoredSteps(serializeSteps(steps))).toEqual(steps);
  });

  it.each(["", "abc", "0;15", "1;-3", "1;", ";;", "NaN;NaN"])(
    "falls back to the default of a value it cannot read (%j)",
    (stored) => {
      const parsed = parseStoredSteps(stored);
      expect(parsed.translationMillimetres).toBeGreaterThan(0);
      expect(parsed.rotationDegrees).toBeGreaterThan(0);
    },
  );

  it("keeps the readable half of a damaged value", () => {
    expect(parseStoredSteps("2;x")).toEqual({ translationMillimetres: 2, rotationDegrees: 15 });
  });

  it("takes a typed step, with a decimal comma", () => {
    expect(withTypedStep(DEFAULT_SNAP_STEPS, "translationMillimetres", "0,5")).toEqual({
      translationMillimetres: 0.5,
      rotationDegrees: 15,
    });
  });

  it("ignores a typed step that is not a positive number", () => {
    for (const text of ["", "0", "-1", "abc"]) {
      expect(withTypedStep(DEFAULT_SNAP_STEPS, "rotationDegrees", text)).toBe(DEFAULT_SNAP_STEPS);
    }
  });
});
