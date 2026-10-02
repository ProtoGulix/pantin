// The mouse mappings of the 3D view (ADR 0036 point 1) as plain data. The left
// button has no binding on purpose: a click selects, a drag in empty space is
// kept for box selection (backlog), and the placement gizmo keeps the button.

export const NAVIGATION_PRESET_IDS = ["solidworks", "zw3d"] as const;
export type NavigationPresetId = (typeof NAVIGATION_PRESET_IDS)[number];

export type CameraInteraction = "rotate" | "pan" | "zoom";

export interface HeldModifiers {
  ctrl: boolean;
  shift: boolean;
}

interface MouseBinding {
  // 0 left, 1 middle, 2 right, as in PointerEvent.button.
  button: number;
  interaction: CameraInteraction;
  // Only the listed modifiers are checked, the others do not matter. The
  // same rule as Babylon.js's input map, so both read one table.
  modifiers?: Partial<HeldModifiers>;
}

export interface NavigationPreset {
  id: NavigationPresetId;
  // First match wins: put the most specific bindings first.
  bindings: readonly MouseBinding[];
  // Pushing the wheel away from you (DOM deltaY < 0) zooms out. SolidWorks
  // does; the ZW3D direction is NOT VERIFIED (spike 0007), Babylon.js's own
  // direction (forward zooms in) is used.
  forwardWheelZoomsOut: boolean;
}

const MIDDLE = 1;
const RIGHT = 2;

export const NAVIGATION_PRESETS: Readonly<Record<NavigationPresetId, NavigationPreset>> = {
  solidworks: {
    id: "solidworks",
    bindings: [
      { button: MIDDLE, modifiers: { ctrl: true }, interaction: "pan" },
      { button: MIDDLE, modifiers: { shift: true }, interaction: "zoom" },
      { button: MIDDLE, interaction: "rotate" },
    ],
    forwardWheelZoomsOut: true,
  },
  zw3d: {
    id: "zw3d",
    bindings: [
      { button: RIGHT, interaction: "rotate" },
      { button: MIDDLE, interaction: "pan" },
    ],
    forwardWheelZoomsOut: false,
  },
};

/** What a button press does under a preset; null for a button with no binding. */
export function resolveBinding(
  preset: NavigationPreset,
  button: number,
  held: HeldModifiers,
): CameraInteraction | null {
  const found = preset.bindings.find(
    (binding) =>
      binding.button === button &&
      (binding.modifiers?.ctrl === undefined || binding.modifiers.ctrl === held.ctrl) &&
      (binding.modifiers?.shift === undefined || binding.modifiers.shift === held.shift),
  );
  return found?.interaction ?? null;
}
