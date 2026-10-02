import { effectiveLayout, showsViewport } from "../central-layout.ts";
import type { Vector3Tuple } from "../frames.ts";
import { STANDARD_VIEWS } from "../navigation/standard-views.ts";
import {
  type CubeCell,
  cellTransform,
  coreBasisOf,
  cubeCells,
  directionKey,
} from "../navigation/view-cube-model.ts";
import type { PanelView } from "../view-model.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The view cube (ADR 0036 point 5), drawn with CSS 3D transforms. It holds no
// camera logic: the orientation comes in, the cell clicked goes out. What a
// cell means and where it sits is in navigation/view-cube-model.ts.

const CELL_PIXELS = 30;

export class ViewCube {
  private readonly cells: { cell: CubeCell; node: HTMLElement }[];
  private readonly root: HTMLElement;
  // Takes the keyboard back after a click: arrows and Space belong to the canvas.
  private readonly focusTarget: HTMLElement;
  // One label per face, over the face's centre cell and as wide as the face.
  private readonly labels: { face: CubeCell; node: HTMLElement }[];
  private choose: (direction: Vector3Tuple) => void = () => undefined;

  constructor(root: HTMLElement, focusTarget: HTMLElement) {
    this.root = root;
    this.focusTarget = focusTarget;
    const scene = element("div", { className: "view-cube__scene" });
    this.cells = cubeCells().map((cell) => ({ cell, node: this.cellNode(cell) }));
    this.labels = this.cells
      .filter(({ cell }) => cell.kind === "face")
      .map(({ cell }) => ({
        face: cell,
        node: element("span", { className: "view-cube__label" }),
      }));
    scene.append(...this.cells.map(({ node }) => node), ...this.labels.map(({ node }) => node));
    root.append(scene);
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
    for (const { face, node } of this.labels) {
      node.textContent = translate(STANDARD_VIEWS[face.face].labelKey);
    }
  }

  /** Alpha and beta of the camera: the cube turns with it. */
  showOrientation(alpha: number, beta: number): void {
    const basis = coreBasisOf(alpha, beta);
    for (const { cell, node } of this.cells) {
      node.style.transform = cellTransform(cell, basis, CELL_PIXELS);
    }
    // A pixel in front of the face, so that no neighbouring cell paints over it.
    for (const { face, node } of this.labels) {
      node.style.transform = `${cellTransform(face, basis, CELL_PIXELS)} translateZ(1px)`;
    }
  }
}
