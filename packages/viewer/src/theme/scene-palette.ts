import { AXIS_COLOURS, type AxisColours, SIGNAL_OFF_COLOURS } from "./data-palette.ts";
import type { SignalColours } from "./signal-look.ts";
import type { ThemeName } from "./theme.ts";

// The colours of the 3D view that follow the theme, as hex strings: the scene
// code turns them into Babylon colours and never reads the page's CSS. The
// selection blue matches --selection in base.css, the signal-on colour --state-normal.
// The joint preview's parent is yellow-orange against the blue child: far apart
// in hue and lightness under protan, deutan and tritan vision (Machado 2009
// simulation); the child also gets an outline, so colour is never the
// only cue. Data colours (axes, markers, conveyors, materials) live in
// data-palette.ts; only the axes, which follow the theme, are carried here.
export interface ScenePalette {
  background: string;
  gridMinor: string;
  gridMajor: string;
  selection: string;
  /** A signal that is on: --state-normal (sensor markers, light beams). */
  signalOn: string;
  /** A signal that is off: a neutral far from signalOn in lightness. */
  signalOff: string;
  /** The parent body of a previewed joint; --joint-parent in base.css. */
  jointParent: string;
  axes: AxisColours;
}

export const SCENE_PALETTES: Readonly<Record<ThemeName, ScenePalette>> = {
  light: {
    background: "#dfe2dd",
    gridMinor: "#c4c9c3",
    gridMajor: "#a9afa9",
    selection: "#1d3f8c",
    signalOn: "#2a6e3f",
    signalOff: SIGNAL_OFF_COLOURS.light,
    jointParent: "#c25e00",
    axes: AXIS_COLOURS.light,
  },
  dark: {
    background: "#262d30",
    gridMinor: "#30383c",
    gridMajor: "#3e474b",
    selection: "#7fa8ec",
    signalOn: "#5cb87a",
    signalOff: SIGNAL_OFF_COLOURS.dark,
    jointParent: "#ffe08a",
    axes: AXIS_COLOURS.dark,
  },
};

export function signalColoursOf(palette: ScenePalette): SignalColours {
  return { on: palette.signalOn, off: palette.signalOff };
}
