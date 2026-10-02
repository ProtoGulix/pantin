import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { babylonToCorePosition } from "../frames.ts";
import { boundsOfBodies } from "./body-bounds.ts";
import type { LoadedBody } from "./body-loader.ts";
import { floorHeight, frameBounds } from "./scene-plan.ts";
import type { Stage } from "./stage.ts";

// The camera and its framing, split from viewport.ts. The context is only
// what framing reads, so the viewport's own context satisfies it as it is.

const RIGHT_MOUSE_BUTTON = 2;

export interface FramingContext {
  camera: ArcRotateCamera;
  stage: Stage;
  loadedBodies: ReadonlyMap<string, LoadedBody>;
  hiddenBodyIds: ReadonlySet<string>;
}

export function createCamera(scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
  // Looking from core -Y towards +Y, slightly from the right and above.
  const camera = new ArcRotateCamera("camera", -2.0, 1.1, 3, Vector3.Zero(), scene);
  camera.wheelDeltaPercentage = 0.01;
  // Pan with a right-button drag or Ctrl + left-button drag. Default actions
  // must be prevented, otherwise the browser's context menu opens on the right
  // button and cancels the drag.
  camera.attachControl(false, true, RIGHT_MOUSE_BUTTON);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  return camera;
}

function framingOf(context: FramingContext, framed: (bodyId: string) => boolean) {
  const { minimum, maximum } = boundsOfBodies(context.loadedBodies, framed);
  return frameBounds(minimum, maximum, context.camera.fov);
}

// Around every loaded body, hidden ones included, so hiding an assembly does
// not move the floor.
function fitStageToBodies(context: FramingContext): void {
  const { minimum, maximum } = boundsOfBodies(context.loadedBodies, () => true);
  const ground = frameBounds(minimum, maximum, context.camera.fov);
  context.stage.fitToBodies(
    babylonToCorePosition(ground.target),
    ground.radius / 2,
    floorHeight(minimum[1]),
  );
}

// null frames every visible body and refits the floor; a list frames only its
// visible bodies and leaves the floor as it is.
export function frameBodies(context: FramingContext, bodyIds: readonly string[] | null): void {
  if (bodyIds === null) {
    fitStageToBodies(context);
  }
  const visible = (bodyId: string) =>
    !context.hiddenBodyIds.has(bodyId) && (bodyIds === null || bodyIds.includes(bodyId));
  // Everything asked for is hidden: keep the camera where it is.
  if (context.loadedBodies.size > 0 && ![...context.loadedBodies.keys()].some(visible)) {
    return;
  }
  const framing = framingOf(context, visible);
  const { camera } = context;
  camera.setTarget(Vector3.FromArray(framing.target));
  camera.radius = framing.radius;
  camera.lowerRadiusLimit = framing.radius * 0.01;
  camera.minZ = framing.radius * 0.001;
  camera.maxZ = framing.radius * 100;
  camera.panningSensibility = 1000 / framing.radius;
}
