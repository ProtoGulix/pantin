import { SPLITTER_KEYBOARD_STEP } from "../layout-sizes.ts";
import { element } from "./dom.ts";

// A draggable, keyboard-accessible separator (role=separator). It only
// reports pixel moves; the layout decides what they mean.

export interface SplitterOptions {
  orientation: "vertical" | "horizontal";
  // Called with the total move since the drag (or key press) started.
  onMove(deltaPixels: number): void;
  onStart(): void;
  onEnd(): void;
}

function keyStep(orientation: SplitterOptions["orientation"], key: string): number {
  const [decrease, increase] =
    orientation === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  if (key === decrease) {
    return -SPLITTER_KEYBOARD_STEP;
  }
  return key === increase ? SPLITTER_KEYBOARD_STEP : 0;
}

export function createSplitter(options: SplitterOptions): HTMLElement {
  const splitter = element("div", {
    className: `splitter splitter--${options.orientation}`,
    attributes: { role: "separator", tabindex: "0", "aria-orientation": options.orientation },
  });
  let start: number | null = null;
  const position = (event: PointerEvent) =>
    options.orientation === "vertical" ? event.clientX : event.clientY;
  splitter.addEventListener("pointerdown", (event) => {
    start = position(event);
    splitter.setPointerCapture(event.pointerId);
    options.onStart();
  });
  splitter.addEventListener("pointermove", (event) => {
    if (start !== null) {
      options.onMove(position(event) - start);
    }
  });
  const finish = () => {
    if (start !== null) {
      start = null;
      options.onEnd();
    }
  };
  splitter.addEventListener("pointerup", finish);
  splitter.addEventListener("pointercancel", finish);
  splitter.addEventListener("keydown", (event) => {
    const step = keyStep(options.orientation, event.key);
    if (step !== 0) {
      event.preventDefault();
      options.onStart();
      options.onMove(step);
      options.onEnd();
    }
  });
  return splitter;
}
