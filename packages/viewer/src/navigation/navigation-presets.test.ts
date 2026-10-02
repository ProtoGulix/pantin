import { describe, expect, it } from "vitest";
import { NAVIGATION_PRESETS, resolveBinding } from "./navigation-presets.ts";

const none = { ctrl: false, shift: false };

describe("SolidWorks preset", () => {
  const preset = NAVIGATION_PRESETS.solidworks;

  it("rotates with the middle button, pans with Ctrl, zooms with Shift", () => {
    expect(resolveBinding(preset, 1, none)).toBe("rotate");
    expect(resolveBinding(preset, 1, { ctrl: true, shift: false })).toBe("pan");
    expect(resolveBinding(preset, 1, { ctrl: false, shift: true })).toBe("zoom");
  });

  it("leaves the left and right buttons alone", () => {
    expect(resolveBinding(preset, 0, none)).toBeNull();
    expect(resolveBinding(preset, 0, { ctrl: true, shift: false })).toBeNull();
    expect(resolveBinding(preset, 2, none)).toBeNull();
  });

  it("lets the wheel push zoom out", () => {
    expect(preset.forwardWheelZoomsOut).toBe(true);
  });
});

describe("ZW3D preset", () => {
  const preset = NAVIGATION_PRESETS.zw3d;

  it("rotates with the right button and pans with the middle one", () => {
    expect(resolveBinding(preset, 2, none)).toBe("rotate");
    expect(resolveBinding(preset, 1, none)).toBe("pan");
  });

  it("leaves the left button alone", () => {
    expect(resolveBinding(preset, 0, none)).toBeNull();
  });
});
