import { Engine } from "@babylonjs/core/Engines/engine.js";

export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, true, { stencil: true }, true);
  // Loading progress is shown by the panel; Babylon's full-page overlay would hide it.
  engine.loadingScreen = {
    displayLoadingUI: () => undefined,
    hideLoadingUI: () => undefined,
    loadingUIBackgroundColor: "",
    loadingUIText: "",
  };
  // A canvas taken out of the layout measures 0x0: the engine keeps its last size until it is back.
  new ResizeObserver(() => {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      engine.resize();
    }
  }).observe(canvas);
  return engine;
}
