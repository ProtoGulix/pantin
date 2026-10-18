import type { ProductMaterial } from "@pantin/protocol";
import type { ThemeName } from "./theme.ts";

// The data colours of the 3D view and of the view cube (ADR 0057 point 7): the
// only place, with scene-palette.ts, where a colour literal may live in
// scene/, conveyors/ and ui/view-cube.ts. A test keeps it so.
//
// A data colour keeps its role, not its value: an entry moves from
// DATA_COLOURS (the same in both themes) to a per-theme record when its
// lightness requires it, as the axes already do.

export interface AxisColours {
  readonly x: string;
  readonly y: string;
  readonly z: string;
}

/**
 * Core X, Y and Z on the stage, the assembly trihedron and the view cube. Red,
 * green and blue are kept; their lightness differs as far as the 3:1 rule on
 * the ground allows, and the letters are the cue where hue cannot be.
 */
export const AXIS_COLOURS: Readonly<Record<ThemeName, Readonly<AxisColours>>> = {
  light: { x: "#730d18", y: "#3a8c00", z: "#1c34b8" },
  dark: { x: "#e8505b", y: "#7dff4d", z: "#5577ff" },
};

/**
 * The neutral of a signal that is off (sensor markers and light beams). A signal
 * that is on takes the theme's state-normal green (ScenePalette.signalOn). It is
 * drawn translucent (signal-look.ts), so the colour seen is its blend over the
 * ground: tests/viewer-colour-pairs.test.ts measures that blend, 3:1 from the
 * ground and a deuteranopia difference from the green of about 26 (light) and
 * 28 (dark), not 40. Thickness and opacity are the cue that tells the two apart.
 */
export const SIGNAL_OFF_COLOURS: Readonly<Record<ThemeName, string>> = {
  light: "#0d1117",
  dark: "#ffffff",
};

interface VolumeColour {
  color: string;
  /** Edges are drawn when set. */
  edges: string | null;
}

/** A sign on a volume: a high-contrast fill and the halo that keeps it legible on any grey. */
export interface GlyphColours {
  readonly fill: string;
  readonly halo: string;
}

export type ConveyorVolumeColours = Readonly<
  Record<"belt" | "guide" | "emitter" | "absorber" | "receiver", VolumeColour>
> & { readonly glyph: GlyphColours };

/**
 * Neutral greys of the conveyor volumes (ADR 0057, user's choice): the emitter is the
 * grey farthest from the ground, the absorber the nearest the 3:1 rule allows, the
 * guide a steel grey between. Greys cannot reach a difference of 40 on a 3:1 ground,
 * so the glyphs "+" and "−" and the form (outlined volume or solid body) are the cue;
 * tests/viewer-colour-pairs.test.ts measures the colours as drawn and keeps the floors.
 */
export const CONVEYOR_VOLUME_COLOURS: Readonly<Record<ThemeName, ConveyorVolumeColours>> = {
  light: {
    belt: { color: "#17191d", edges: "#3a414b" },
    guide: { color: "#1c262e", edges: "#1c262e" },
    emitter: { color: "#121212", edges: "#121212" },
    absorber: { color: "#7c7c7c", edges: "#7c7c7c" },
    receiver: { color: "#5a5f66", edges: null },
    glyph: { fill: "#1a1e20", halo: "#f4f4f0" },
  },
  dark: {
    belt: { color: "#3a4046", edges: "#c4cad1" },
    guide: { color: "#d0d8e0", edges: "#d0d8e0" },
    emitter: { color: "#f5f5f5", edges: "#f5f5f5" },
    absorber: { color: "#7a7a7a", edges: "#7a7a7a" },
    receiver: { color: "#8a9099", edges: null },
    glyph: { fill: "#f4f4f0", halo: "#1a1e20" },
  },
};

/** How opaque each volume is drawn: a guide collides, so it is nearly solid; the others are faint. */
export const VOLUME_ALPHAS: Readonly<
  Record<Exclude<keyof ConveyorVolumeColours, "glyph">, number>
> = {
  belt: 1,
  guide: 0.75,
  emitter: 0.16,
  absorber: 0.16,
  receiver: 1,
};

/** Shading of a view cube face by its lightness (percent): a bluish grey. */
export function viewCubeFaceColour(lightness: number): string {
  return `hsl(220 8% ${lightness.toFixed(1)}%)`;
}

export const DATA_COLOURS = {
  conveyorArrow: "#e6edf3",
  /** The white sky light. */
  skyLight: "#ffffff",
  /** The ground shows nothing but the shadow of the bodies, in black. */
  shadowOnly: "#000000",
  /** The light grey of the floor bounce under the sky light. */
  skyGround: "#8c8c8c",
  /** STL has no material: a light neutral grey. */
  defaultBody: "#b9bec7",
  productAlbedo: {
    cardboard: "#a97c50",
    plastic: "#4c8bc4",
    wood: "#7a4e2d",
    steel: "#7b828c",
    stainless_steel: "#b4bac2",
    aluminium: "#cfd4da",
    brass: "#b5a642",
    copper: "#b87333",
  } satisfies Record<ProductMaterial, string>,
} as const;
