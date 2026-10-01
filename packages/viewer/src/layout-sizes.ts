// Sizes of the resizable panes. Pure: stored text in, safe numbers out, so a
// corrupt or outdated value in the browser can never break the layout.

export const PANEL_WIDTH_DEFAULT = 320;
const PANEL_WIDTH_MINIMUM = 220;
// The 3D view always keeps at least this width.
const VIEWPORT_WIDTH_MINIMUM = 320;

// Keyboard step of a splitter, in pixels.
export const SPLITTER_KEYBOARD_STEP = 16;

export function clampPanelWidth(width: number, windowWidth: number): number {
  const maximum = Math.max(PANEL_WIDTH_MINIMUM, windowWidth - VIEWPORT_WIDTH_MINIMUM);
  if (!Number.isFinite(width)) {
    return Math.min(PANEL_WIDTH_DEFAULT, maximum);
  }
  return Math.round(Math.min(Math.max(width, PANEL_WIDTH_MINIMUM), maximum));
}

export function parseStoredNumber(text: string | null, fallback: number): number {
  if (text === null || text.trim() === "") {
    return fallback;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
}
