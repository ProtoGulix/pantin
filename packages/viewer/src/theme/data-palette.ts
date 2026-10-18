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

interface VolumeColours {
  color: string;
  /** Edges are drawn when set. */
  edges: string | null;
}

/** Shading of a view cube face by its lightness (percent): a bluish grey. */
export function viewCubeFaceColour(lightness: number): string {
  return `hsl(220 8% ${lightness.toFixed(1)}%)`;
}

export const DATA_COLOURS = {
  /** The target face of an alignment; the moving face takes the selection. */
  faceTarget: "#a371f7",
  sensorMarker: { on: "#58a6ff", off: "#6e7681" },
  lightBeam: { on: "#ff5a4d", off: "#8a4a44" },
  conveyorVolume: {
    belt: { color: "#2a2d33", edges: "#4b525e" },
    guide: { color: "#7d6ff0", edges: "#b3a9ff" },
    emitter: { color: "#3fb950", edges: "#56d364" },
    absorber: { color: "#f0883e", edges: "#ffa657" },
    receiver: { color: "#6b3a36", edges: null },
  } satisfies Record<string, VolumeColours>,
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
