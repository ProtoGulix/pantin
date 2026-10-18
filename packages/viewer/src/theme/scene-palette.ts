import type { ThemeName } from "./theme.ts";

// The colours of the 3D view that follow the theme, as hex strings: the scene
// code turns them into Babylon colours and never reads the page's CSS. The
// selection blue matches --selection in base.css, the driven colour --state-normal.
// The joint preview's parent is yellow-orange against the blue child: far apart
// in hue and lightness under protan, deutan and tritan vision (Machado 2009
// simulation); the child also gets an outline, so colour is never the
// only cue. Axes and materials are data, not theme.
export interface ScenePalette {
  background: string;
  gridMinor: string;
  gridMajor: string;
  selection: string;
  drivenJoint: string;
  /** The parent body of a previewed joint; --joint-parent in base.css. */
  jointParent: string;
}

export const SCENE_PALETTES: Readonly<Record<ThemeName, ScenePalette>> = {
  light: {
    background: "#dfe2dd",
    gridMinor: "#c4c9c3",
    gridMajor: "#a9afa9",
    selection: "#1d3f8c",
    drivenJoint: "#2a6e3f",
    jointParent: "#c25e00",
  },
  dark: {
    background: "#262d30",
    gridMinor: "#30383c",
    gridMajor: "#3e474b",
    selection: "#7fa8ec",
    drivenJoint: "#5cb87a",
    jointParent: "#ffe08a",
  },
};
