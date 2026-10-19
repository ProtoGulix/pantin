import type { JointType } from "@pantin/protocol";
import type { StarEdgeKind } from "./joint-star-forest.ts";

// Line style of each edge kind (ADR 0059 point 5, starting values to validate
// on a screenshot). Data only: the view turns it into SVG attributes. Colour is
// never a cue here; the three cues are the line, the glyph and the joint name.

export type StarGlyphId =
  | "weld"
  | "prismatic"
  | "revolute"
  | "continuous"
  | "helical"
  | "ground-hatch";

export type StarEdgeStyleKey = JointType | Exclude<StarEdgeKind, "joint">;

export interface StarEdgeStyle {
  cssClass: string;
  widthPixels: number;
  // SVG stroke-dasharray; null for a solid line.
  dashArray: string | null;
  lineCap: "butt" | "round";
  // The glyph at the middle of the edge; null for none.
  glyphId: StarGlyphId | null;
  // The joint name next to the glyph.
  showsLabel: boolean;
  // Drawn lighter than the joints, for lines that carry no joint.
  faint: boolean;
}

type StyleParts = Omit<StarEdgeStyle, "cssClass">;

function style(name: StarEdgeStyleKey, parts: StyleParts): StarEdgeStyle {
  return { cssClass: `joint-star-edge--${name}`, ...parts };
}

export const STAR_EDGE_STYLES: Readonly<Record<StarEdgeStyleKey, StarEdgeStyle>> = {
  fixed: style("fixed", {
    widthPixels: 1,
    dashArray: null,
    lineCap: "butt",
    glyphId: "weld",
    showsLabel: true,
    faint: false,
  }),
  prismatic: style("prismatic", {
    widthPixels: 2,
    dashArray: "10 5",
    lineCap: "butt",
    glyphId: "prismatic",
    showsLabel: true,
    faint: false,
  }),
  revolute: style("revolute", {
    widthPixels: 2,
    dashArray: null,
    lineCap: "butt",
    glyphId: "revolute",
    showsLabel: true,
    faint: false,
  }),
  continuous: style("continuous", {
    widthPixels: 2,
    dashArray: "0.1 5",
    lineCap: "round",
    glyphId: "continuous",
    showsLabel: true,
    faint: false,
  }),
  helical: style("helical", {
    widthPixels: 2,
    dashArray: "10 4 2 4",
    lineCap: "butt",
    glyphId: "helical",
    showsLabel: true,
    faint: false,
  }),
  follows: style("follows", {
    widthPixels: 1,
    dashArray: "1 4",
    lineCap: "round",
    glyphId: null,
    showsLabel: false,
    faint: false,
  }),
  anchor: style("anchor", {
    widthPixels: 1,
    dashArray: null,
    lineCap: "butt",
    glyphId: "ground-hatch",
    showsLabel: false,
    faint: true,
  }),
};

/** The style of an edge: its joint type for a joint edge, else its kind. */
export function edgeStyleOf(kind: StarEdgeKind, jointType: JointType | undefined): StarEdgeStyle {
  if (kind !== "joint") {
    return STAR_EDGE_STYLES[kind];
  }
  // A joint edge always has a type; the fallback only keeps the function total.
  return STAR_EDGE_STYLES[jointType ?? "fixed"];
}
