import type { Translate } from "../i18n/translate.ts";
import {
  type PlacedNode,
  TOGGLE_WIDTH,
  WORLD_HALF_WIDTH,
  WORLD_LABEL_DROP,
} from "../joint-star/joint-star-layout.ts";
import { glyphMark } from "./joint-star-glyphs.ts";
import { svgElement } from "./svg-dom.ts";

// The shapes of the nodes of the joint tree and their fold toggle (ADR 0059), drawn
// around the node's anchor: its left edge, at the middle of its row.

const GROUP_HEIGHT = 20;
const BODY_HEIGHT = 16;
const FOCUS_RING_MARGIN = 3;

// A group is a rounded rectangle and a body a pill: the outline says which, not the colour.
export function frame(
  node: PlacedNode,
  width: number,
  margin: number,
  className: string,
): SVGElement {
  const height = node.kind === "group" ? GROUP_HEIGHT : BODY_HEIGHT;
  const radius = node.kind === "group" ? 5 : height / 2;
  return svgElement("rect", {
    class: className,
    x: -margin,
    y: -height / 2 - margin,
    width: width + 2 * margin,
    height: height + 2 * margin,
    rx: radius + margin,
  });
}

export function nodeShape(node: PlacedNode, width = node.width): SVGElement[] {
  if (node.kind === "world") {
    const ring = WORLD_HALF_WIDTH + FOCUS_RING_MARGIN;
    return [
      svgElement("circle", {
        class: "joint-star-node__focus",
        cx: WORLD_HALF_WIDTH,
        cy: 0,
        r: ring,
      }),
      svgElement("circle", {
        class: "joint-star-node__shape",
        cx: WORLD_HALF_WIDTH,
        cy: 0,
        r: WORLD_HALF_WIDTH,
      }),
      glyphMark(
        "ground-hatch",
        WORLD_HALF_WIDTH,
        1,
        "joint-star-glyph joint-star-glyph--ground",
        0.9,
      ),
    ];
  }
  return [
    frame(node, width, FOCUS_RING_MARGIN, "joint-star-node__focus"),
    frame(node, width, 0, "joint-star-node__shape"),
  ];
}

// World's texts sit on the ground, not in a shape: they get a halo.
function countClass(node: PlacedNode): string {
  return node.kind === "world"
    ? "joint-star-node__count joint-star-node__ground-text"
    : "joint-star-node__count";
}

// The fold chevron and the count of following bodies. The chevron's shape tells
// the state (pointing right: folded, down: unfolded); the number says how many.
// `interactive` is false for the copy drawn in the top layer, which only shows.
export function toggleMark(
  node: PlacedNode,
  translate: Translate,
  interactive: boolean,
): SVGElement {
  const left = node.toggleOffset;
  const centre = node.kind === "world" ? WORLD_LABEL_DROP : 0;
  const chevron = node.unfolded ? "M -4 -2.5 L 4 -2.5 L 0 3.5 Z" : "M -2.5 -4 L 3.5 0 L -2.5 4 Z";
  const title = translate(node.unfolded ? "jointStar.toggle.fold" : "jointStar.toggle.unfold", {
    count: node.followingBodyCount,
  });
  const attributes = interactive
    ? { class: "joint-star-node__toggle", "data-toggle-id": node.id, "aria-hidden": "true" }
    : { class: "joint-star-node__toggle", "aria-hidden": "true" };
  return svgElement("g", attributes, [
    svgElement("title", {}, [title]),
    svgElement("rect", {
      class: "joint-star-node__toggle-hit",
      x: left - 4,
      y: centre - GROUP_HEIGHT / 2,
      width: TOGGLE_WIDTH - 2,
      height: GROUP_HEIGHT,
      rx: 3,
    }),
    svgElement("path", {
      class: "joint-star-node__chevron",
      d: chevron,
      transform: `translate(${left + 4} ${centre})`,
    }),
    svgElement("text", { class: countClass(node), x: left + 12, y: centre + 3.5 }, [
      String(node.followingBodyCount),
    ]),
  ]);
}
