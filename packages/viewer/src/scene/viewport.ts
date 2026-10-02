import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Body, PoseSnapshot } from "@pantin/protocol";
import type { PlacementGizmoSpec } from "../gizmo/anchor-frame.ts";
import type { JointPreview } from "../joints/joint-preview.ts";
import type { NavigationSettings } from "../navigation/navigation-settings.ts";
import type { CameraAngles } from "../navigation/standard-views.ts";
import type { InterpolatedPose } from "../pose-interpolation.ts";
import type { RigidTransform } from "../rigid-transform.ts";
import type { SensorMarker } from "../sensors/sensor-markers.ts";
import { type LoadedBody, loadBody } from "./body-loader.ts";
import { frameBodies } from "./camera-framing.ts";
import { createCameraNavigation } from "./camera-navigation.ts";
import { createRenderSwitch } from "./render-switch.ts";
import { bodyRenderKey, planSceneSync } from "./scene-plan.ts";
import { createContext, type ViewportContext } from "./viewport-context.ts";

// The Babylon canvas: shows the bodies it is given and reports clicks. It
// knows nothing about the API or the panel; the controller wires them.

export type MeshBytesLoader = (pantinId: string, body: Body) => Promise<ArrayBuffer>;

export interface ViewportCallbacks {
  // doubleClick: the second click of a double click, which follows a first
  // pick of the same body (ADR 0019: a click selects the assembly, a double
  // click the body).
  onBodyPicked(bodyId: string | null, doubleClick: boolean): void;
  // Raw reason in English; the caller translates the message around it.
  onLoadError(bodyName: string, reason: string): void;
  // The placement gizmo (ADR 0034): the placement the drag asks for, in the
  // frame of the anchor, then the end of the drag (also after Escape).
  onPlacementDragged(assemblyKey: string, placement: RigidTransform): void;
  onPlacementDragEnded(): void;
}

export interface Viewport {
  showBodies(pantinId: string | null, bodies: readonly Body[]): void;
  setSelectedBodies(bodyIds: ReadonlySet<string>): void;
  // Hidden bodies stay loaded, so showing them again downloads nothing.
  setHiddenBodies(bodyIds: ReadonlySet<string>): void;
  /** null frames every body; otherwise only the listed bodies. */
  frameBodies(bodyIds: readonly string[] | null): void;
  /** Feeds one snapshot of the pose stream; bodies follow it from the next frame. */
  pushPoses(snapshot: PoseSnapshot): void;
  /** Forgets every pose; overlays hide until the next snapshot (bodies are replaced with the Pantin). */
  clearPoses(): void;
  /** Colours a joint's bodies and draws its axis; null goes back to the selection. */
  showJointPreview(preview: JointPreview | null): void;
  /** Draws every sensor along its joint (ADR 0024). */
  showSensorMarkers(markers: readonly SensorMarker[]): void;
  /** Tag values from the core: switch markers light up on 1. */
  showTagStates(values: ReadonlyMap<string, number>): void;
  /**
   * False stops the render loop while the chain diagram covers the view (ADR
   * 0029 point 10); true restarts it. Poses keep arriving meanwhile, so the
   * first frame after a restart shows the latest ones.
   */
  setRendering(active: boolean): void;
  /** The gizmo of the selected assembly, or null to remove it (ADR 0034 point 3). */
  showPlacementGizmo(spec: PlacementGizmoSpec | null): void;
  /** After a drag: the Pantin was read again, the gizmo follows the assembly again. */
  releasePlacementGizmo(): void;
  /** Mouse preset, wheel direction, arrow step and projection (ADR 0036). */
  setNavigation(settings: NavigationSettings): void;
  /** A standard view or a cube cell (ADR 0036): the camera turns to these angles in 300 ms. */
  showView(angles: CameraAngles): void;
  /** Alpha and beta of the camera when they change, for the view cube; also once at once. */
  onCameraOrientation(listener: (alpha: number, beta: number) => void): void;
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

function applyVisibility(context: ViewportContext): void {
  for (const [bodyId, loaded] of context.loadedBodies) {
    loaded.node.setEnabled(!context.hiddenBodyIds.has(bodyId));
  }
}

function addLoadedBody(context: ViewportContext, bodyId: string, loaded: LoadedBody): void {
  context.loadedBodies.set(bodyId, loaded);
  loaded.node.setEnabled(!context.hiddenBodyIds.has(bodyId));
  // A body whose mesh arrives after the snapshot takes its pose at once, so
  // that framing and arrow sizes see it where it stands, not at its file's place.
  const known = context.poses.latestPose(bodyId);
  if (known !== undefined) {
    loaded.setDisplacement(known.translation, known.rotation);
  }
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

// A hidden body cannot be picked.
function pickBody(context: ViewportContext, x: number, y: number) {
  const { scene, bodyIdByMesh } = context;
  return scene.pick(x, y, (mesh) => bodyIdByMesh.has(mesh) && mesh.isEnabled());
}

function listenToPicks(context: ViewportContext, callbacks: ViewportCallbacks): void {
  context.scene.onPointerObservable.add((pointerInfo) => {
    // A tap is a click without drag, so orbiting the camera never selects.
    const { type } = pointerInfo;
    if (type !== PointerEventTypes.POINTERTAP && type !== PointerEventTypes.POINTERDOUBLETAP) {
      return;
    }
    const { scene, bodyIdByMesh } = context;
    const pick = pickBody(context, scene.pointerX, scene.pointerY);
    const pickedMesh = pick.hit ? pick.pickedMesh : null;
    const bodyId = pickedMesh === null ? null : (bodyIdByMesh.get(pickedMesh) ?? null);
    callbacks.onBodyPicked(bodyId, type === PointerEventTypes.POINTERDOUBLETAP);
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
    context.highlights.redraw();
    context.sensorMarkers.redraw();
    frameBodies(context, null);
  });
}

// The displacement is set on the node just before drawing, so the frame shows
// the pose of this instant. The visitor is built once; each body still costs
// a few small tuples per frame.
function applyPosesEachFrame(context: ViewportContext): void {
  const visit = (bodyId: string, pose: InterpolatedPose): void => {
    context.loadedBodies.get(bodyId)?.setDisplacement(pose.translation, pose.rotation);
    context.highlights.followPose(bodyId, pose.translation, pose.rotation);
    context.sensorMarkers.followPose(bodyId, pose.translation, pose.rotation);
    context.placementGizmo.followPose(bodyId, pose.translation, pose.rotation);
  };
  context.scene.onBeforeRenderObservable.add(() => context.poses.sample(performance.now(), visit));
}

// Poses are forgotten only when the open Pantin changes or closes, and body
// keys include the Pantin id, so showBodies removes those bodies. They are NOT
// reset to the identity displacement: with placements (ADR 0033) their resting
// place is W . B, which the viewer does not compute. Overlays hide until poses
// arrive instead.
function forgetPoses(context: ViewportContext): void {
  context.poses.reset();
  context.highlights.forgetPoses();
  context.sensorMarkers.forgetPoses();
  context.placementGizmo.forgetPoses();
}

function navigationOf(context: ViewportContext, canvas: HTMLCanvasElement) {
  return createCameraNavigation({
    scene: context.scene,
    canvas,
    camera: context.camera,
    view: context.view,
    pickBodyPoint: (x, y) => pickBody(context, x, y).pickedPoint,
  });
}

export function createViewport(
  canvas: HTMLCanvasElement,
  loadBytes: MeshBytesLoader,
  callbacks: ViewportCallbacks,
): Viewport {
  const engine = createEngine(canvas);
  const scene = new Scene(engine);
  const context = createContext(scene, canvas, {
    onDragged: callbacks.onPlacementDragged,
    onDragEnded: callbacks.onPlacementDragEnded,
  });
  listenToPicks(context, callbacks);
  applyPosesEachFrame(context);
  const navigation = navigationOf(context, canvas);
  const setRendering = createRenderSwitch(engine, scene);
  return {
    showBodies: (pantinId, bodies) => showBodies(context, pantinId, bodies, loadBytes, callbacks),
    frameBodies: (bodyIds) => frameBodies(context, bodyIds),
    pushPoses: (snapshot) => context.poses.push(snapshot, performance.now()),
    clearPoses: () => forgetPoses(context),
    setSelectedBodies: (bodyIds) => context.highlights.setSelectedBodies(bodyIds),
    setHiddenBodies: (bodyIds) => {
      context.hiddenBodyIds = bodyIds;
      applyVisibility(context);
      context.sensorMarkers.setHidden(bodyIds);
    },
    showJointPreview: (preview) => context.highlights.setJointPreview(preview),
    showSensorMarkers: (markers) => context.sensorMarkers.show(markers),
    showTagStates: (values) => context.sensorMarkers.setStates(values),
    setRendering,
    showPlacementGizmo: (spec) => context.placementGizmo.show(spec),
    releasePlacementGizmo: () => context.placementGizmo.release(),
    setNavigation: (settings) => navigation.apply(settings),
    showView: (angles) => navigation.showView(angles),
    onCameraOrientation: (listener) => navigation.onOrientation(listener),
  };
}
