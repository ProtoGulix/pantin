import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAVIGATION,
  parseStoredNavigation,
  serializeNavigation,
} from "./navigation-settings.ts";

describe("navigation settings", () => {
  it("defaults to SolidWorks, orthographic, 15 degrees", () => {
    expect(DEFAULT_NAVIGATION).toEqual({
      preset: "solidworks",
      reverseWheel: false,
      arrowStepDegrees: 15,
      perspective: false,
    });
  });

  it("round-trips through the stored text", () => {
    const settings = {
      preset: "zw3d",
      reverseWheel: true,
      arrowStepDegrees: 45,
      perspective: true,
    } as const;
    expect(parseStoredNavigation(serializeNavigation(settings))).toEqual(settings);
  });

  it("falls back to the defaults for missing or unreadable text", () => {
    expect(parseStoredNavigation(null)).toEqual(DEFAULT_NAVIGATION);
    expect(parseStoredNavigation("nonsense;;7;")).toEqual({
      ...DEFAULT_NAVIGATION,
      perspective: false,
    });
  });
});
