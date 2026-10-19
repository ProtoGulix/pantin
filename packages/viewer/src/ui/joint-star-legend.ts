import type { JointType } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { edgeStyleOf, type StarEdgeStyle } from "../joint-star/joint-star-styles.ts";
import { JOINT_TYPES, jointTypeLabelKey } from "../joints/joint-labels.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./browser-storage.ts";
import { element } from "./dom.ts";
import { boltMark, edgeGlyph, glyphMark, lineAttributes } from "./joint-star-glyphs.ts";
import { svgElement } from "./svg-dom.ts";

// The legend of the joint view (ADR 0059 point 5), in a corner. Closed it is one
// line, "Legend" and a chevron; a click unfolds it, and that choice is kept in the
// browser. It draws the same marks as the tree, so it cannot drift from it.

const SAMPLE_WIDTH = 52;
const SAMPLE_HEIGHT = 20;
const GROUP_SAMPLE_WIDTH = 24;
const OPEN = "open";

function sample(children: readonly SVGElement[], className = "joint-star-sample"): SVGElement {
  return svgElement(
    "svg",
    { class: className, width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT, "aria-hidden": "true" },
    children,
  );
}

// A short piece of an edge: its line, and its glyph when it has one.
function edgeSample(style: StarEdgeStyle, jointClass: string): SVGElement {
  const middle = SAMPLE_HEIGHT / 2;
  const line = svgElement("line", {
    class: `joint-star-edge__line ${jointClass}`,
    x1: 2,
    y1: middle,
    x2: SAMPLE_WIDTH - 2,
    y2: middle,
    ...lineAttributes(style),
  });
  const glyph =
    style.glyphId !== null && style.glyphId !== "ground-hatch"
      ? [
          svgElement("circle", {
            class: "joint-star-edge__backing",
            cx: SAMPLE_WIDTH / 2,
            cy: middle,
            r: 8,
          }),
          edgeGlyph(style.glyphId, SAMPLE_WIDTH / 2, middle),
        ]
      : [];
  return sample([line, ...glyph]);
}

// Shapes sit at the left of their sample, as they sit before their label in the tree.
function shapeSample(kind: "world" | "group" | "body"): SVGElement {
  const centre = { x: 11, y: SAMPLE_HEIGHT / 2 };
  if (kind === "world") {
    return sample([
      svgElement("circle", { class: "joint-star-node__shape", cx: centre.x, cy: centre.y, r: 9 }),
      glyphMark(
        "ground-hatch",
        centre.x,
        centre.y + 1,
        "joint-star-glyph joint-star-glyph--ground",
        0.8,
      ),
    ]);
  }
  const body = kind === "body";
  const shape = svgElement("rect", {
    class: "joint-star-node__shape",
    x: 1,
    y: centre.y - (body ? 6 : 9),
    width: body ? 20 : 24,
    height: body ? 12 : 18,
    rx: body ? 6 : 5,
  });
  if (body) {
    return sample([shape]);
  }
  return sample([
    shape,
    svgElement("path", {
      class: "joint-star-node__chevron",
      d: "M -2.5 -4 L 3.5 0 L -2.5 4 Z",
      transform: `translate(${GROUP_SAMPLE_WIDTH + 10} ${centre.y})`,
    }),
    svgElement(
      "text",
      { class: "joint-star-node__count", x: GROUP_SAMPLE_WIDTH + 19, y: centre.y + 3.5 },
      ["3"],
    ),
  ]);
}

interface LegendRow {
  mark: SVGElement;
  text: string;
}

function rowsOf(translate: Translate): LegendRow[] {
  const joints: LegendRow[] = JOINT_TYPES.map((type: JointType) => ({
    mark: edgeSample(edgeStyleOf("joint", type), ""),
    text: translate(jointTypeLabelKey(type)),
  }));
  return [
    ...joints,
    {
      mark: sample([
        svgElement("circle", { class: "joint-star-edge__backing", cx: 22, cy: 10, r: 8 }),
        boltMark(22, 10),
      ]),
      text: translate("jointStar.legend.driven"),
    },
    {
      mark: edgeSample(edgeStyleOf("follows", undefined), ""),
      text: translate("jointStar.legend.follows"),
    },
    {
      mark: edgeSample(edgeStyleOf("anchor", undefined), "is-faint"),
      text: translate("jointStar.legend.anchor"),
    },
    { mark: shapeSample("world"), text: translate("jointStar.legend.world") },
    { mark: shapeSample("group"), text: translate("jointStar.legend.group") },
    { mark: shapeSample("body"), text: translate("jointStar.legend.body") },
    {
      mark: sample([
        svgElement("line", {
          class: "joint-star-sample__selection",
          x1: 2,
          y1: 10,
          x2: SAMPLE_WIDTH - 2,
          y2: 10,
        }),
      ]),
      text: translate("jointStar.legend.selection"),
    },
  ];
}

export class JointStarLegend {
  readonly root = element("div", { className: "joint-star-legend" });
  private open = readStoredText(STORAGE_KEYS.jointStarLegend) === OPEN;
  private translate: Translate | null = null;

  /** Draws the legend again, in the language at hand. */
  render(translate: Translate): void {
    this.translate = translate;
    const toggle = element("button", {
      className: "joint-star-legend__toggle",
      attributes: {
        type: "button",
        "aria-expanded": String(this.open),
        title: translate(this.open ? "jointStar.legend.close" : "jointStar.legend.open"),
      },
    });
    toggle.append(
      svgElement(
        "svg",
        { class: "joint-star-legend__chevron", width: 10, height: 10, "aria-hidden": "true" },
        [
          svgElement("path", {
            class: "joint-star-node__chevron",
            d: this.open ? "M 1 2.5 L 9 2.5 L 5 8.5 Z" : "M 2.5 1 L 8.5 5 L 2.5 9 Z",
          }),
        ],
      ),
      element("span", { text: translate("jointStar.legend.title") }),
    );
    toggle.addEventListener("click", () => this.setOpen(!this.open));
    this.root.classList.toggle("is-open", this.open);
    if (!this.open) {
      this.root.replaceChildren(toggle);
      return;
    }
    this.root.replaceChildren(
      toggle,
      element(
        "ul",
        { className: "joint-star-legend__list" },
        rowsOf(translate).map((row) => {
          const item = element("li", { className: "joint-star-legend__row" });
          item.append(row.mark, element("span", { text: row.text }));
          return item;
        }),
      ),
    );
  }

  private setOpen(open: boolean): void {
    this.open = open;
    writeStoredText(STORAGE_KEYS.jointStarLegend, open ? OPEN : "closed");
    if (this.translate !== null) {
      this.render(this.translate);
      this.root.querySelector("button")?.focus();
    }
  }
}
