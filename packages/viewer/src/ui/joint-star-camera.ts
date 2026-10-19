import type { StarLayout } from "../joint-star/joint-star-layout.ts";
import {
  fitToLayout,
  IDENTITY_LIMITS,
  pan,
  panToReveal,
  type ScaleLimits,
  type StarViewport,
  toScreen,
  wheelZoomFactor,
  zoomAround,
} from "../joint-star/joint-star-viewport.ts";

// The pointer side of the joint tree's zoom and pan (ADR 0059 point 6): the wheel
// zooms around the pointer, dragging the empty ground pans, and the viewport is
// kept here, in memory. The maths are pure (joint-star-viewport.ts); this class
// only listens to the pointer and tells the view where to move the drawing.

// What a drag must not start on: the controls, the legend, the nodes and the edges.
const UNGRABBABLE = ".joint-star-legend, .joint-star__controls, [data-node-id], [data-edge-id]";

export class JointStarCamera {
  private viewport: StarViewport | null = null;
  // The squeeze limits of the layout on show: they change with a fold.
  private limits: ScaleLimits = IDENTITY_LIMITS;
  // Set by the user's own zoom or pan; until then the view follows the area's size.
  private moved = false;
  private dragFrom: { x: number; y: number } | null = null;

  private readonly host: HTMLElement;
  private readonly onMove: (viewport: StarViewport) => void;

  constructor(host: HTMLElement, onMove: (viewport: StarViewport) => void) {
    this.host = host;
    this.onMove = onMove;
    host.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    host.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    host.addEventListener("pointermove", (event) => this.onPointerMove(event));
    host.addEventListener("pointerup", (event) => this.endDrag(event));
    host.addEventListener("pointercancel", (event) => this.endDrag(event));
    // The area clips the drawing; a focus must not scroll it, the viewport pans instead.
    host.addEventListener("scroll", () => host.scrollTo(0, 0));
  }

  /** The current view, or null before the first fit. */
  get current(): StarViewport | null {
    return this.viewport;
  }

  /** True while the view is still the automatic fit, which a resize of the area may redo. */
  get isAutomatic(): boolean {
    return !this.moved;
  }

  /** Forgets the view: the next fit starts again from the whole tree. */
  forget(): void {
    this.viewport = null;
    this.moved = false;
  }

  /** Keeps the limits of a new layout for the next zooms. */
  useLayout(layout: StarLayout): void {
    this.limits = layout;
  }

  /** The whole tree, squeezed down to the layout's limit; needs an area with a size. */
  fit(layout: StarLayout): void {
    this.limits = layout;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width > 0 && height > 0) {
      this.moveTo(fitToLayout(layout, { width, height }));
      this.moved = false;
    }
  }

  /** Pans the least that brings a node, at its world position, back into the area. */
  reveal(world: { x: number; y: number }): void {
    if (this.viewport !== null) {
      this.moved = true;
      const size = { width: this.host.clientWidth, height: this.host.clientHeight };
      this.moveTo(panToReveal(this.viewport, toScreen(this.viewport, world), size));
    }
  }

  private moveTo(viewport: StarViewport): void {
    this.viewport = viewport;
    this.onMove(viewport);
  }

  private onWheel(event: WheelEvent): void {
    if (this.viewport === null) {
      return;
    }
    event.preventDefault();
    this.moved = true;
    const rect = this.host.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.moveTo(zoomAround(this.viewport, pointer, wheelZoomFactor(event.deltaY), this.limits));
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0 || this.viewport === null || target?.closest(UNGRABBABLE) !== null) {
      return;
    }
    this.dragFrom = { x: event.clientX, y: event.clientY };
    this.host.setPointerCapture(event.pointerId);
    this.host.classList.add("is-panning");
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.dragFrom === null || this.viewport === null) {
      return;
    }
    const { x, y } = this.dragFrom;
    this.dragFrom = { x: event.clientX, y: event.clientY };
    this.moved = true;
    this.moveTo(pan(this.viewport, event.clientX - x, event.clientY - y));
  }

  private endDrag(event: PointerEvent): void {
    if (this.dragFrom !== null) {
      this.dragFrom = null;
      this.host.releasePointerCapture(event.pointerId);
      this.host.classList.remove("is-panning");
    }
  }
}
