import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Body } from "@pantin/protocol";
import { babylonToCorePosition, type Vector3Tuple } from "../frames.ts";
import { type LoadedBody, loadBody } from "./body-loader.ts";
import { bodyRenderKey, frameBounds, planSceneSync } from "./scene-plan.ts";
import { createStage, type Stage } from "./stage.ts";

// The Babylon canvas: shows the bodies it is given and reports clicks. It
// knows nothing about the API or the panel; the controller wires them.

export type MeshBytesLoader = (pantinId: string, body: Body) => Promise<ArrayBuffer>;

export interface ViewportCallbacks {
  onBodyPicked(bodyId: string | null): void;
  onLoadError(message: string): void;
}

export interface Viewport {
  showBodies(pantinId: string | null, bodies: readonly Body[]): void;
  setSelectedBody(bodyId: string | null): void;
}

const SELECTION_COLOR = Color3.FromHexString("#f0a030");
const RIGHT_MOUSE_BUTTON = 2;

interface ViewportContext {
  scene: Scene;
  camera: ArcRotateCamera;
  stage: Stage;
  // What each body should show (set as soon as a load starts, to skip duplicates).
  wantedKeys: Map<string, string>;
  loadedBodies: Map<string, LoadedBody>;
  bodyIdByMesh: Map<AbstractMesh, string>;
  selectedBodyId: string | null;
}

function createCamera(scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
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

function toTuple(vector: Vector3): Vector3Tuple {
  return [vector.x, vector.y, vector.z];
}

function frameAllBodies(context: ViewportContext): void {
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const loaded of context.loadedBodies.values()) {
    const bounds = loaded.node.getHierarchyBoundingVectors(true);
    minimum.minimizeInPlace(bounds.min);
    maximum.maximizeInPlace(bounds.max);
  }
  const framing = frameBounds(toTuple(minimum), toTuple(maximum), context.camera.fov);
  const { camera } = context;
  camera.setTarget(Vector3.FromArray(framing.target));
  camera.radius = framing.radius;
  camera.lowerRadiusLimit = framing.radius * 0.01;
  camera.minZ = framing.radius * 0.001;
  camera.maxZ = framing.radius * 100;
  camera.panningSensibility = 1000 / framing.radius;
  const coreCentre = babylonToCorePosition(framing.target);
  context.stage.fitToBodies(coreCentre, framing.radius / 2);
}

function applySelection(context: ViewportContext): void {
  for (const [bodyId, loaded] of context.loadedBodies) {
    for (const mesh of loaded.meshes) {
      mesh.renderOverlay = bodyId === context.selectedBodyId;
      mesh.overlayColor = SELECTION_COLOR;
      mesh.overlayAlpha = 0.35;
    }
  }
}

function removeBody(context: ViewportContext, bodyId: string): void {
  const loaded = context.loadedBodies.get(bodyId);
  context.wantedKeys.delete(bodyId);
  if (loaded === undefined) {
    return;
  }
  for (const mesh of loaded.meshes) {
    context.bodyIdByMesh.delete(mesh);
  }
  loaded.dispose();
  context.loadedBodies.delete(bodyId);
}

function addLoadedBody(context: ViewportContext, bodyId: string, loaded: LoadedBody): void {
  context.loadedBodies.set(bodyId, loaded);
  for (const mesh of loaded.meshes) {
    context.bodyIdByMesh.set(mesh, bodyId);
    context.stage.shadowGenerator.addShadowCaster(mesh, false);
  }
}

async function loadAndShow(
  context: ViewportContext,
  pantinId: string,
  body: Body,
  loadBytes: MeshBytesLoader,
): Promise<void> {
  const key = bodyRenderKey(pantinId, body);
  const loaded = await loadBody(context.scene, body, await loadBytes(pantinId, body));
  // The Pantin or the body may have changed while the file was downloading.
  if (context.wantedKeys.get(body.id) !== key) {
    loaded.dispose();
    return;
  }
  addLoadedBody(context, body.id, loaded);
}

function listenToPicks(context: ViewportContext, callbacks: ViewportCallbacks): void {
  context.scene.onPointerObservable.add((pointerInfo) => {
    // A tap is a click without drag, so orbiting the camera never selects.
    if (pointerInfo.type !== PointerEventTypes.POINTERTAP) {
      return;
    }
    const { scene, bodyIdByMesh } = context;
    const pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => bodyIdByMesh.has(mesh));
    const pickedMesh = pick.hit ? pick.pickedMesh : null;
    callbacks.onBodyPicked(pickedMesh === null ? null : (bodyIdByMesh.get(pickedMesh) ?? null));
  });
}

export function createViewport(
  canvas: HTMLCanvasElement,
  loadBytes: MeshBytesLoader,
  callbacks: ViewportCallbacks,
): Viewport {
  const engine = new Engine(canvas, true, { stencil: true }, true);
  // Loading progress is shown by the panel; Babylon's full-page overlay would hide it.
  engine.loadingScreen = {
    displayLoadingUI: () => undefined,
    hideLoadingUI: () => undefined,
    loadingUIBackgroundColor: "",
    loadingUIText: "",
  };
  const scene = new Scene(engine);
  const context: ViewportContext = {
    scene,
    camera: createCamera(scene, canvas),
    stage: createStage(scene),
    wantedKeys: new Map(),
    loadedBodies: new Map(),
    bodyIdByMesh: new Map(),
    selectedBodyId: null,
  };
  listenToPicks(context, callbacks);
  new ResizeObserver(() => engine.resize()).observe(canvas);
  engine.runRenderLoop(() => scene.render());

  return {
    showBodies: (pantinId, bodies) => {
      const plan = planSceneSync(context.wantedKeys, pantinId, bodies);
      for (const bodyId of plan.bodyIdsToRemove) {
        removeBody(context, bodyId);
      }
      if (pantinId === null || plan.bodiesToLoad.length === 0) {
        return;
      }
      const loads = plan.bodiesToLoad.map((body) => {
        context.wantedKeys.set(body.id, bodyRenderKey(pantinId, body));
        return loadAndShow(context, pantinId, body, loadBytes).catch((error: unknown) => {
          context.wantedKeys.delete(body.id);
          const reason = error instanceof Error ? error.message : String(error);
          callbacks.onLoadError(`Cannot display body "${body.name}": ${reason}`);
        });
      });
      void Promise.all(loads).then(() => {
        applySelection(context);
        frameAllBodies(context);
      });
    },
    setSelectedBody: (bodyId) => {
      context.selectedBodyId = bodyId;
      applySelection(context);
    },
  };
}
