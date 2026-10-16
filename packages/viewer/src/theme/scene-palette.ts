import type { ThemeName } from "./theme.ts";

// The colours of the 3D view that follow the theme, as hex strings: the scene
// code turns them into Babylon colours and never reads the page's CSS. The
// selection blue matches --selection in base.css, the driven colour --state-normal.
// Axes, materials and the joint preview's parent colour are data, not theme.
export interface ScenePalette {
  background: string;
  gridMinor: string;
  gridMajor: string;
  selection: string;
  drivenJoint: string;
}

export const SCENE_PALETTES: Readonly<Record<ThemeName, ScenePalette>> = {
  light: {
    background: "#dfe2dd",
    gridMinor: "#c4c9c3",
    gridMajor: "#a9afa9",
    selection: "#1d3f8c",
    drivenJoint: "#2a6e3f",
  },
  dark: {
    background: "#262d30",
    gridMinor: "#30383c",
    gridMajor: "#3e474b",
    selection: "#7fa8ec",
    drivenJoint: "#5cb87a",
  },
};
