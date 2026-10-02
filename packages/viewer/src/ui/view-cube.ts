import { effectiveLayout, showsViewport } from "../central-layout.ts";
import type { Vector3Tuple } from "../frames.ts";
import { STANDARD_VIEWS } from "../navigation/standard-views.ts";
import {
  type CubeCell,
  cellTransform,
  coreBasisOf,
  cubeCells,
  directionKey,
  faceLightness,
  type TriadAxis,
  type TriadSegment,
  triadSegments,
} from "../navigation/view-cube-model.ts";
import type { PanelView } from "../view-model.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { svgElement } from "./svg-dom.ts";

// The view cube (ADR 0036 point 5), drawn with CSS 3D transforms. It holds no
// camera logic: the orientation comes in, the cell clicked goes out. What a
// cell means and where it sits is in navigation/view-cube-model.ts.

// The cube is three cells wide: 60 px.
const CELL_PIXELS = 20;
const HALF_SIZE = 1.5 * CELL_PIXELS;
// Longer than the cube's edge, so each tip reaches past it.
const TRIAD_LENGTH = 1.35 * 3 * CELL_PIXELS;
// Letters sit this far beyond the tip of their axis, along it.
const LETTER_OFFSET = 7;

export class ViewCube {
  private readonly cells: { cell: CubeCell; node: HTMLElement }[];
  private readonly root: HTMLElement;
  // Takes the keyboard back after a click: arrows and Space belong to the canvas.
  private readonly focusTarget: HTMLElement;
  // One solid, shaded square per face, carrying its name, behind the cells.
  private readonly faces: { face: CubeCell; node: HTMLElement }[];
  private readonly triad: Readonly<Record<TriadAxis, { line: SVGElement; letter: SVGElement }>>;
  private choose: (direction: Vector3Tuple) => void = () => undefined;

  constructor(root: HTMLElement, focusTarget: HTMLElement) {
    this.root = root;
    this.focusTarget = focusTarget;
    const scene = element("div", { className: "view-cube__scene" });
    this.cells = cubeCells().map((cell) => ({ cell, node: this.cellNode(cell) }));
    this.faces = this.cells
      .filter(({ cell }) => cell.kind === "face")
      .map(({ cell }) => ({ face: cell, node: element("span", { className: "view-cube__face" }) }));
    // The faces first: the cells, invisible until hovered, are over them.
    scene.append(...this.faces.map(({ node }) => node), ...this.cells.map(({ node }) => node));
    this.triad = triadNodes();
    // Under the scene: the opaque faces hide the axes where they pass behind.
    root.append(triadElement(this.triad), scene);
  }

  private cellNode(cell: CubeCell): HTMLElement {
    const node = element("button", {
      className: `view-cube__cell view-cube__cell--${cell.kind}`,
      attributes: {
        type: "button",
        tabindex: "-1",
        "data-direction": directionKey(cell.direction),
      },
    });
    // A click must not move the focus to the button.
    node.addEventListener("pointerdown", (event) => event.preventDefault());
    node.addEventListener("click", () => {
      this.choose(cell.direction);
      this.focusTarget.focus({ preventScroll: true });
    });
    // Every cell that asks for the same view lights up, wherever it is on the cube.
    const highlight = (on: boolean) => {
      for (const other of this.cells) {
        other.node.classList.toggle(
          "is-hot",
          on && other.node.dataset.direction === node.dataset.direction,
        );
      }
    };
    node.addEventListener("pointerenter", () => highlight(true));
    node.addEventListener("pointerleave", () => highlight(false));
    return node;
  }

  /** Labels in the language in use, and what a click does. */
  render(view: PanelView, intents: PanelIntents): void {
    const { translate } = view;
    this.choose = (direction) => intents.showViewFromDirection(direction);
    const layout = effectiveLayout(view.toolbar.centralLayout, view.toolbar.mode === "edit");
    this.root.hidden = view.toolbar.mode !== "edit" || !showsViewport(layout);
    this.root.setAttribute("aria-label", translate("viewCube.label"));
    for (const { cell, node } of this.cells) {
      node.title = cell.kind === "face" ? translate(STANDARD_VIEWS[cell.face].labelKey) : "";
    }
    for (const { face, node } of this.faces) {
      node.textContent = translate(STANDARD_VIEWS[face.face].labelKey);
    }
  }

  /** Alpha and beta of the camera: the cube turns with it. */
  showOrientation(alpha: number, beta: number): void {
    const basis = coreBasisOf(alpha, beta);
    for (const { cell, node } of this.cells) {
      node.style.transform = cellTransform(cell, basis, CELL_PIXELS);
    }
    // Half a pixel behind the cells of the face, which are not painted.
    for (const { face, node } of this.faces) {
      node.style.transform = `${cellTransform(face, basis, CELL_PIXELS)} translateZ(-0.5px)`;
      const lightness = faceLightness(basis, STANDARD_VIEWS[face.face].camera);
      node.style.background = `hsl(220 8% ${lightness.toFixed(1)}%)`;
    }
    for (const segment of triadSegments(basis, HALF_SIZE, TRIAD_LENGTH)) {
      showSegment(this.triad[segment.axis], segment);
    }
  }
}

const TRIAD_COLOURS: Readonly<Record<TriadAxis, string>> = {
  x: "#e5484d",
  y: "#46a758",
  z: "#3e63dd",
};

function triadNodes(): Record<TriadAxis, { line: SVGElement; letter: SVGElement }> {
  const make = (axis: TriadAxis) => ({
    line: svgElement("line", {
      stroke: TRIAD_COLOURS[axis],
      "stroke-width": 2,
      "stroke-linecap": "round",
    }),
    letter: svgElement(
      "text",
      {
        fill: TRIAD_COLOURS[axis],
        "text-anchor": "middle",
        "dominant-baseline": "central",
        class: "view-cube__letter",
      },
      [axis.toUpperCase()],
    ),
  });
  return { x: make("x"), y: make("y"), z: make("z") };
}

// Drawn flat under the cube, centred on it: the opaque faces hide the part
// of an axis behind the cube.
function triadElement(
  nodes: Record<TriadAxis, { line: SVGElement; letter: SVGElement }>,
): SVGElement {
  const parts = Object.values(nodes).flatMap(({ line, letter }) => [line, letter]);
  return svgElement("svg", { class: "view-cube__triad", "aria-hidden": "true" }, parts);
}

function showSegment(nodes: { line: SVGElement; letter: SVGElement }, segment: TriadSegment): void {
  const { from, to } = segment;
  const display = segment.visible ? "" : "none";
  nodes.line.style.display = display;
  nodes.letter.style.display = display;
  nodes.line.setAttribute("x1", String(from.x));
  nodes.line.setAttribute("y1", String(from.y));
  nodes.line.setAttribute("x2", String(to.x));
  nodes.line.setAttribute("y2", String(to.y));
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  nodes.letter.setAttribute("x", String(to.x + ((to.x - from.x) / length) * LETTER_OFFSET));
  nodes.letter.setAttribute("y", String(to.y + ((to.y - from.y) / length) * LETTER_OFFSET));
}
