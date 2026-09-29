import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Body, PoseSnapshot } from "@pantin/protocol";
import { babylonToCorePosition, coreDisplacementToBabylon, type Vector3Tuple } from "../frames.ts";
import type { JointPreview } from "../joints/joint-preview.ts";
import { type InterpolatedPose, PoseInterpolator } from "../pose-interpolation.ts";
import { type LoadedBody, loadBody } from "./body-loader.ts";
import { createJointArrow, type JointArrow } from "./joint-arrow.ts";
import {
  type BodyHighlight,
  bodyHighlight,
  bodyRenderKey,
  frameBounds,
  placeJointArrow,
  planSceneSync,
} from "./scene-plan.ts";
import { createStage, type Stage } from "./stage.ts";

// The Babylon canvas: shows the bodies it is given and reports clicks. It
// knows nothing about the API or the panel; the controller wires them.

export type MeshBytesLoader = (pantinId: string, body: Body) => Promise<ArrayBuffer>;

export interface ViewportCallbacks {
  onBodyPicked(bodyId: string | null): void;
  // Raw reason in English; the caller translates the message around it.
  onLoadError(bodyName: string, reason: string): void;
}

export interface Viewport {
  showBodies(pantinId: string | null, bodies: readonly Body[]): void;
  setSelectedBody(bodyId: string | null): void;
  /** null frames every body; otherwise only the listed bodies. */
  frameBodies(bodyIds: readonly string[] | null): void;
  /** Feeds one snapshot of the pose stream; bodies follow it from the next frame. */
  pushPoses(snapshot: PoseSnapshot): void;
  /** Forgets every pose: bodies go back to their reference placement. */
  clearPoses(): void;
  /** Colours a joint's bodies and draws its axis; null goes back to the selection. */
  showJointPreview(preview: JointPreview | null): void;
}

// Parent and child match the swatches of the joint form (--joint-parent and
// --joint-child in base.css); the child is the body that moves.
const SELECTION_COLOR = Color3.FromHexString("#f0a030");
const HIGHLIGHT_COLORS: Readonly<Record<BodyHighlight, Color3>> = {
  selected: SELECTION_COLOR,
  parent: Color3.FromHexString("#a371f7"),
  child: SELECTION_COLOR,
};
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
  poses: PoseInterpolator;
  preview: JointPreview | null;
  arrow: JointArrow;
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

// null frames every loaded body and resizes the ground around them; a list
// frames only those bodies and leaves the ground as it is.
function frameBodies(context: ViewportContext, bodyIds: readonly string[] | null): void {
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const [bodyId, loaded] of context.loadedBodies) {
    if (bodyIds === null || bodyIds.includes(bodyId)) {
      const bounds = loaded.node.getHierarchyBoundingVectors(true);
      minimum.minimizeInPlace(bounds.min);
      maximum.maximizeInPlace(bounds.max);
    }
  }
  const framing = frameBounds(toTuple(minimum), toTuple(maximum), context.camera.fov);
  const { camera } = context;
  camera.setTarget(Vector3.FromArray(framing.target));
  camera.radius = framing.radius;
  camera.lowerRadiusLimit = framing.radius * 0.01;
  camera.minZ = framing.radius * 0.001;
  camera.maxZ = framing.radius * 100;
  camera.panningSensibility = 1000 / framing.radius;
  if (bodyIds === null) {
    context.stage.fitToBodies(babylonToCorePosition(framing.target), framing.radius / 2);
  }
}

function applySelection(context: ViewportContext): void {
  for (const [bodyId, loaded] of context.loadedBodies) {
    const highlight = bodyHighlight(bodyId, context.selectedBodyId, context.preview);
    for (const mesh of loaded.meshes) {
      mesh.renderOverlay = highlight !== null;
      mesh.overlayColor = HIGHLIGHT_COLORS[highlight ?? "selected"];
      mesh.overlayAlpha = 0.35;
    }
  }
}

// Sized on the child body, so it waits for that body's mesh.
function drawJointArrow(context: ViewportContext): void {
  const { preview, arrow } = context;
  const child = preview === null ? undefined : context.loadedBodies.get(preview.childBodyId);
  if (preview === null || preview.origin === null || preview.axis === null || child === undefined) {
    arrow.hide();
    return;
  }
  const bounds = child.node.getHierarchyBoundingVectors(true);
  const extent = bounds.max.subtract(bounds.min).length();
  arrow.show(placeJointArrow(preview.origin, preview.axis, extent));
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

function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, true, { stencil: true }, true);
  // Loading progress is shown by the panel; Babylon's full-page overlay would hide it.
  engine.loadingScreen = {
    displayLoadingUI: () => undefined,
    hideLoadingUI: () => undefined,
    loadingUIBackgroundColor: "",
    loadingUIText: "",
  };
  new ResizeObserver(() => engine.resize()).observe(canvas);
  return engine;
}

function showBodies(
  context: ViewportContext,
  pantinId: string | null,
  bodies: readonly Body[],
  loadBytes: MeshBytesLoader,
  callbacks: ViewportCallbacks,
): void {
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
      callbacks.onLoadError(body.name, error instanceof Error ? error.message : String(error));
    });
  });
  void Promise.all(loads).then(() => {
    applySelection(context);
    drawJointArrow(context);
    frameBodies(context, null);
  });
}

// The displacement is set on the node just before drawing, so the frame shows
// the pose of this instant. The visitor is built once; each body still costs
// a few small tuples per frame.
function applyPosesEachFrame(context: ViewportContext): void {
  const visit = (bodyId: string, pose: InterpolatedPose): void => {
    context.loadedBodies.get(bodyId)?.setDisplacement(pose.translation, pose.rotation);
    if (bodyId === context.preview?.parentBodyId) {
      context.arrow.follow(coreDisplacementToBabylon(pose.translation, pose.rotation));
    }
  };
  context.scene.onBeforeRenderObservable.add(() => context.poses.sample(performance.now(), visit));
}

const NO_DISPLACEMENT = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } as const;

function resetPlacements(context: ViewportContext): void {
  for (const loaded of context.loadedBodies.values()) {
    loaded.setDisplacement(NO_DISPLACEMENT.translation, NO_DISPLACEMENT.rotation);
  }
  context.arrow.follow(NO_DISPLACEMENT);
}

function showJointPreview(context: ViewportContext, preview: JointPreview | null): void {
  // Until the next frame, in case the new parent has no pose at all.
  if (preview?.parentBodyId !== context.preview?.parentBodyId) {
    context.arrow.follow(NO_DISPLACEMENT);
  }
  context.preview = preview;
  applySelection(context);
  drawJointArrow(context);
}

export function createViewport(
  canvas: HTMLCanvasElement,
  loadBytes: MeshBytesLoader,
  callbacks: ViewportCallbacks,
): Viewport {
  const engine = createEngine(canvas);
  const scene = new Scene(engine);
  const context: ViewportContext = {
    scene,
    camera: createCamera(scene, canvas),
    stage: createStage(scene),
    wantedKeys: new Map(),
    loadedBodies: new Map(),
    bodyIdByMesh: new Map(),
    selectedBodyId: null,
    poses: new PoseInterpolator(),
    preview: null,
    arrow: createJointArrow(scene),
  };
  listenToPicks(context, callbacks);
  applyPosesEachFrame(context);
  engine.runRenderLoop(() => scene.render());
  return {
    showBodies: (pantinId, bodies) => showBodies(context, pantinId, bodies, loadBytes, callbacks),
    frameBodies: (bodyIds) => frameBodies(context, bodyIds),
    pushPoses: (snapshot) => context.poses.push(snapshot, performance.now()),
    clearPoses: () => {
      context.poses.reset();
      resetPlacements(context);
    },
    setSelectedBody: (bodyId) => {
      context.selectedBodyId = bodyId;
      applySelection(context);
    },
    showJointPreview: (preview) => showJointPreview(context, preview),
  };
}
