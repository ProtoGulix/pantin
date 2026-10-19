import type { StarEdgeStyle, StarGlyphId } from "../joint-star/joint-star-styles.ts";
import { type IconName, iconPath } from "./icons.ts";
import { svgElement } from "./svg-dom.ts";

// The marks of the joint star shared by the drawing and its legend (ADR 0059
// point 5): the 12 px glyph of a joint type, the bolt of a driven joint, and
// the line style of an edge. Colours come from the stylesheet, never from here.

const GLYPH_SIZE = 12;
const ICON_SIZE = 16;
const GLYPH_SCALE = GLYPH_SIZE / ICON_SIZE;

const GLYPH_ICONS: Readonly<Record<StarGlyphId, IconName>> = {
  weld: "joint-weld",
  prismatic: "joint-prismatic",
  revolute: "joint-revolute",
  continuous: "joint-continuous",
  helical: "joint-helical",
  "ground-hatch": "ground-hatch",
};

/** A glyph centred on (x, y), 12 px wide whatever the zoom of its parent. */
export function glyphMark(
  icon: IconName,
  x: number,
  y: number,
  className: string,
  scale = GLYPH_SCALE,
): SVGElement {
  const offset = (ICON_SIZE * scale) / 2;
  return svgElement(
    "g",
    { class: className, transform: `translate(${x - offset} ${y - offset}) scale(${scale})` },
    [svgElement("path", { d: iconPath(icon) })],
  );
}

export function edgeGlyph(glyphId: StarGlyphId, x: number, y: number): SVGElement {
  return glyphMark(GLYPH_ICONS[glyphId], x, y, `joint-star-glyph joint-star-glyph--${glyphId}`);
}

export function boltMark(x: number, y: number): SVGElement {
  return glyphMark("bolt", x, y, "joint-star-glyph joint-star-glyph--bolt");
}

/** The SVG attributes of the line of an edge: its width, dashes and caps. */
export function lineAttributes(style: StarEdgeStyle): Record<string, string | number> {
  return {
    "stroke-width": style.widthPixels,
    // The resting width, for the selection styles to thicken it (joint-star.css).
    style: `--edge-width: ${style.widthPixels}`,
    "stroke-linecap": style.lineCap,
    ...(style.dashArray === null ? {} : { "stroke-dasharray": style.dashArray }),
  };
}
