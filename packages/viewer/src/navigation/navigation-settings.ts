import { NAVIGATION_PRESET_IDS, type NavigationPresetId } from "./navigation-presets.ts";

// The navigation settings are a setting of the viewer, kept in the browser
// like the gizmo steps and never in the Pantin (ADR 0036 point 1).
// Stored as "preset;reverseWheel;arrowStepDegrees;perspective".

export interface NavigationSettings {
  preset: NavigationPresetId;
  reverseWheel: boolean;
  arrowStepDegrees: number;
  // Orthographic is the default, as on a drawing (ADR 0036 point 6).
  perspective: boolean;
}

export const ARROW_STEPS_DEGREES: readonly number[] = [5, 15, 45];

export const DEFAULT_NAVIGATION: NavigationSettings = {
  preset: "solidworks",
  reverseWheel: false,
  arrowStepDegrees: 15,
  perspective: false,
};

export function isNavigationPresetId(value: unknown): value is NavigationPresetId {
  return typeof value === "string" && (NAVIGATION_PRESET_IDS as readonly string[]).includes(value);
}

export function serializeNavigation(settings: NavigationSettings): string {
  const flag = (value: boolean) => (value ? "1" : "0");
  return [
    settings.preset,
    flag(settings.reverseWheel),
    settings.arrowStepDegrees,
    flag(settings.perspective),
  ].join(";");
}

/** A stored value that is missing or unreadable gives the defaults, field by field. */
export function parseStoredNavigation(stored: string | null): NavigationSettings {
  const [preset, reverse, step, perspective] = (stored ?? "").split(";");
  const stepDegrees = Number(step);
  return {
    preset: isNavigationPresetId(preset) ? preset : DEFAULT_NAVIGATION.preset,
    reverseWheel: reverse === undefined ? DEFAULT_NAVIGATION.reverseWheel : reverse === "1",
    arrowStepDegrees: ARROW_STEPS_DEGREES.includes(stepDegrees)
      ? stepDegrees
      : DEFAULT_NAVIGATION.arrowStepDegrees,
    perspective: perspective === undefined ? DEFAULT_NAVIGATION.perspective : perspective === "1",
  };
}
