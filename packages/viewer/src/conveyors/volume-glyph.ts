import type { VolumeStyle } from "./conveyor-drawing.ts";

// The billboard glyph of a volume (ADR 0057): grey alone cannot tell an emitter
// from an absorber, so "+" (products come in) and "−" (products go out) mark
// them, like the letters at the axis tips.

const VOLUME_GLYPHS: Readonly<Partial<Record<VolumeStyle, string>>> = {
  emitter: "+",
  absorber: "−",
};

/** The glyph of a volume style, or null when its shape and place are cue enough. */
export function glyphOf(style: VolumeStyle): string | null {
  return VOLUME_GLYPHS[style] ?? null;
}

// Share of the view height a glyph takes, so that it stays legible when zoomed out.
const SCREEN_SHARE = 0.04;
// A glyph never gets smaller than this, in metres, however close the camera.
const MIN_SIZE = 0.02;

/**
 * World size of a glyph: a constant share of the screen, but never larger than the
 * volume it marks, so that a close view does not hide the scene behind a plus sign.
 */
export function glyphSize(visibleHeight: number, longestSide: number): number {
  return Math.max(MIN_SIZE, Math.min(SCREEN_SHARE * visibleHeight, longestSide));
}
