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

// The 3D view's share of the central area when the diagram is under it
// (ADR 0030 point 7).
export const SPLIT_RATIO_DEFAULT = 0.6;
// Each half keeps at least this height, as long as the area can afford it.
const SPLIT_PART_MINIMUM = 120;

export function clampSplitRatio(ratio: number, areaHeight: number): number {
  if (!Number.isFinite(ratio) || !(areaHeight > 0)) {
    return SPLIT_RATIO_DEFAULT;
  }
  // Never above one half, so that a tiny area still yields minimum <= maximum.
  const minimum = Math.min(SPLIT_PART_MINIMUM / areaHeight, 0.5);
  return Math.min(Math.max(ratio, minimum), 1 - minimum);
}

/** The ratio after the splitter moved by `deltaPixels` (a drag, or a key step). */
export function splitRatioAfterMove(
  startRatio: number,
  deltaPixels: number,
  areaHeight: number,
): number {
  return clampSplitRatio(startRatio + deltaPixels / areaHeight, areaHeight);
}

export const CONSOLE_HEIGHT_DEFAULT = 180;
const CONSOLE_HEIGHT_MINIMUM = 80;
// The 3D view and the diagram keep at least this height above the console.
const CENTRAL_HEIGHT_MINIMUM = 160;

export function clampConsoleHeight(height: number, areaHeight: number): number {
  const maximum = Math.max(CONSOLE_HEIGHT_MINIMUM, areaHeight - CENTRAL_HEIGHT_MINIMUM);
  if (!Number.isFinite(height)) {
    return Math.min(CONSOLE_HEIGHT_DEFAULT, maximum);
  }
  return Math.round(Math.min(Math.max(height, CONSOLE_HEIGHT_MINIMUM), maximum));
}
