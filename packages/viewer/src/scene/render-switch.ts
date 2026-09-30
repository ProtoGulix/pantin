import type { Engine } from "@babylonjs/core/Engines/engine.js";

// Starts the render loop and returns the switch for it: the chain diagram
// covers the 3D view (ADR 0029 point 10), so nothing is drawn meanwhile. Called
// at every store update, so only a change starts or stops the loop.
export function createRenderSwitch(
  engine: Pick<Engine, "runRenderLoop" | "stopRenderLoop">,
  scene: { render(): void },
): (active: boolean) => void {
  const renderFrame = () => scene.render();
  engine.runRenderLoop(renderFrame);
  let rendering = true;
  return (active) => {
    if (active === rendering) {
      return;
    }
    rendering = active;
    if (active) {
      engine.runRenderLoop(renderFrame);
    } else {
      engine.stopRenderLoop(renderFrame);
    }
  };
}
