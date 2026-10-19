import type { MessageKey, Translate } from "../i18n/translate.ts";
import {
  JOINT_NAME_MAX_CHARACTERS,
  type PlacedEdge,
  type PlacedNode,
  shortenLabel,
} from "../joint-star/joint-star-layout.ts";
import { edgeStyleOf } from "../joint-star/joint-star-styles.ts";
import { jointTypeLabelKey } from "../joints/joint-labels.ts";
import { boltMark, edgeGlyph, lineAttributes } from "./joint-star-glyphs.ts";
import { svgElement } from "./svg-dom.ts";

// The edges of the joint tree as SVG (ADR 0059 point 5): a curve, and on a joint the
// glyph of its type, the bolt when an actuator drives it, and its name, by the
// curve, near the child. Nothing is placed here: `project` of joint-star-draw.ts moves
// the curve and the marks, so the marks keep their size whatever the zoom.

const EDGE_HIT_WIDTH = 12;
// The marks hang this far beside the curve near the child, so that the curve stays clear
// and no room is kept between columns for the name.
export const MARKS_DROP = 14;
const GLYPH_BACKING_RADIUS = 8;
// From the glyph of a joint to its name, and to the bolt of a driven joint.
const NAME_OFFSET = 11;
const BOLT_OFFSET = 14;

export interface EdgeContext {
  translate: Translate;
  nodeLabels: ReadonlyMap<string, string>;
}

export interface DrawnStarEdge {
  group: SVGElement;
  jointId: string | undefined;
  parent: PlacedNode;
  child: PlacedNode;
  curves: SVGElement[];
  marks: SVGElement | null;
}

export function jointTypeText(edge: PlacedEdge, translate: Translate): string {
  const key: MessageKey = jointTypeLabelKey(edge.jointType ?? "fixed");
  return translate(key);
}

function edgeLabelText(edge: PlacedEdge, context: EdgeContext): string {
  const name = edge.jointName ?? "";
  const lookup = (id: string) => context.nodeLabels.get(id) ?? id;
  const base = context.translate("jointStar.edge", {
    name,
    type: jointTypeText(edge, context.translate),
    parent: lookup(edge.parentId),
    child: lookup(edge.childId),
  });
  return edge.driven ? `${base}, ${context.translate("jointStar.edge.driven")}` : base;
}

// The glyph, the bolt of a driven joint, then the name to their left, around the origin: the
// group is moved beside the curve by `project`. The name goes left, towards the
// parent, because the child column on the right is the crowded side.
function edgeMarks(edge: PlacedEdge, glyphId: Parameters<typeof edgeGlyph>[0]): SVGElement {
  const backing = (x: number, radius: number) =>
    svgElement("circle", { class: "joint-star-edge__backing", cx: x, cy: 0, r: radius });
  const marks = [backing(0, GLYPH_BACKING_RADIUS), edgeGlyph(glyphId, 0, 0)];
  if (edge.driven) {
    marks.push(backing(-BOLT_OFFSET, GLYPH_BACKING_RADIUS - 1), boltMark(-BOLT_OFFSET, 0));
  }
  marks.push(
    svgElement(
      "text",
      {
        class: "joint-star-edge__label",
        x: -(NAME_OFFSET + (edge.driven ? BOLT_OFFSET : 0)),
        y: 4,
        "text-anchor": "end",
      },
      [shortenLabel(edge.jointName ?? "", JOINT_NAME_MAX_CHARACTERS)],
    ),
  );
  return svgElement("g", { class: "joint-star-edge__marks" }, marks);
}

function edgeAttributes(edge: PlacedEdge, context: EdgeContext): Record<string, string> {
  return edge.kind === "joint"
    ? {
        role: "graphics-symbol",
        "aria-label": edgeLabelText(edge, context),
        "data-edge-id": edge.childId,
      }
    : { "aria-hidden": "true", "data-edge-id": edge.childId };
}

export function drawEdge(
  edge: PlacedEdge,
  parent: PlacedNode,
  child: PlacedNode,
  context: EdgeContext,
): DrawnStarEdge {
  const style = edgeStyleOf(edge.kind, edge.jointType);
  const line = svgElement("path", {
    class: "joint-star-edge__line",
    ...lineAttributes(style),
  });
  const curves = [line];
  const children: SVGElement[] = [line];
  let marks: SVGElement | null = null;
  if (edge.kind === "joint") {
    const hit = svgElement("path", {
      class: "joint-star-edge__hit",
      "stroke-width": EDGE_HIT_WIDTH,
    });
    curves.push(hit);
    children.push(hit);
    if (style.glyphId !== null) {
      marks = edgeMarks(edge, style.glyphId);
      children.push(marks);
    }
  }
  const group = svgElement(
    "g",
    {
      class: `joint-star-edge ${style.cssClass}${style.faint ? " is-faint" : ""}`,
      ...edgeAttributes(edge, context),
    },
    children,
  );
  return { group, jointId: edge.jointId, parent, child, curves, marks };
}
