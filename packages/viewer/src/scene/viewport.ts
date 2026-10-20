import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Body, PoseSnapshot } from "@pantin/protocol";
import type { FaceHighlight } from "../alignment/alignment-session.ts";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import type { AssemblyFrameTarget } from "../assembly-frame.ts";
import type { DrawingItem } from "../conveyors/conveyor-drawing.ts";
import type { ConveyorKind } from "../conveyors/conveyor-kinds.ts";
import type { PlacementGizmoSpec } from "../gizmo/anchor-frame.ts";
import type { JointPreview } from "../joints/joint-preview.ts";
import type { NavigationSettings } from "../navigation/navigation-settings.ts";
import type { CameraAngles } from "../navigation/standard-views.ts";
import type { RigidTransform } from "../rigid-transform.ts";
import type { SensorMarker } from "../sensors/sensor-markers.ts";
import { type ScenePalette, signalColoursOf } from "../theme/scene-palette.ts";
import { type LoadedBody, loadBody } from "./body-loader.ts";
import { frameBodies } from "./camera-framing.ts";
import { createCameraNavigation } from "./camera-navigation.ts";
import { createRenderSwitch } from "./render-switch.ts";
import { bodyRenderKey, forgetFailedLoads, isCurrentLoad, planSceneSync } from "./scene-plan.ts";
import { createContext, type ViewportContext } from "./viewport-context.ts";
import { listenToPicks, pickBody } from "./viewport-picks.ts";
import { applyPosesEachFrame, forgetPoses, pushSnapshot } from "./viewport-poses.ts";

// The Babylon canvas: shows the bodies it is given and reports clicks. It
// knows nothing about the API or the panel; the controller wires them.

export type MeshBytesLoader = (pantinId: string, body: Body) => Promise<ArrayBuffer>;

export interface ViewportCallbacks {
  // doubleClick: the second click of a double click, which follows a first
  // pick of the same body (ADR 0040 point 9: a click selects the top-level
  // assembly, each double click goes one level down, down to the body).
  onBodyPicked(bodyId: string | null, doubleClick: boolean): void;
  // A click on a belt, guide, emitter, absorber or presence sensor with no body in front of it.
  onConveyorPicked(kind: ConveyorKind, id: string): void;
  // Raw reason in English; the caller translates the message around it.
  onLoadError(bodyName: string, reason: string): void;
  // The placement gizmo (ADR 0034): the placement the drag asks for, in the
  // frame of the anchor, then the end of the drag (also after Escape).
  onPlacementDragged(assemblyKey: string, placement: RigidTransform): void;
  onPlacementDragEnded(): void;
  // A click while aligning (ADR 0035 point 3); null when it hit no body.
  onAlignmentPick(pick: ViewportPick | null): void;
}

export interface Viewport {
  showBodies(pantinId: string | null, bodies: readonly Body[]): void;
  /** Loads again the bodies whose mesh failed to load, from the last bodies shown. */
  retryFailedBodies(): void;
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
  /** Belts, guides, emitters, absorbers and presence sensor beams (ADR 0043 point 13). */
  showConveyorObjects(items: readonly DrawingItem[]): void;
  /** Outlines the selected belt, guide, emitter, absorber or presence sensor (key "kind:id"). */
  setSelectedConveyor(key: string | null): void;
  /** Tag values from the core: switch markers and beams light up on 1. */
  showTagStates(values: ReadonlyMap<string, number>): void;
  /**
   * False stops the render loop while the chain diagram covers the view (ADR
   * 0029 point 10); true restarts it. Poses keep arriving meanwhile, so the
   * first frame after a restart shows the latest ones.
   */
  setRendering(active: boolean): void;
  /** The trihedron of an assembly's frame (ADR 0042 point 1); null removes it. */
  showAssemblyFrame(target: AssemblyFrameTarget | null): void;
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
  /** True: a click is an alignment pick (ADR 0035 point 3); false: it selects. */
  setAlignmentPicking(active: boolean): void;
  /** Tints the faces picked for an alignment; an empty list removes them. */
  showFaceHighlights(highlights: readonly FaceHighlight[]): void;
  /** The theme changed (ADR 0053): background, grid and selection colours follow, without a reload. */
  setScenePalette(palette: ScenePalette): void;
}

function removeBody(context: ViewportContext, bodyId: string): void {
  const loaded = context.loadedBodies.get(bodyId);
  context.wantedKeys.delete(bodyId);
  context.failedBodyIds.delete(bodyId);
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

function hideBodies(context: ViewportContext, bodyIds: ReadonlySet<string>): void {
  context.hiddenBodyIds = bodyIds;
  applyVisibility(context);
  context.sensorMarkers.setHidden(bodyIds);
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
  if (!isCurrentLoad(context.wantedKeys, body.id, key)) {
    loaded.dispose();
    return;
  }
  addLoadedBody(context, body.id, loaded);
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
  // A canvas taken out of the layout measures 0x0: the engine keeps its last size until it is back.
  new ResizeObserver(() => {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      engine.resize();
    }
  }).observe(canvas);
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
    context.failedBodyIds.delete(body.id);
    return loadAndShow(context, pantinId, body, loadBytes).catch((error: unknown) => {
      // The key stays in wantedKeys: the plan then treats the body as settled
      // and does not retry at every redraw. A change of key (unit, mesh,
      // another Pantin) or removing the body clears it. A stale failure, for a
      // key replaced meanwhile, is dropped.
      if (!isCurrentLoad(context.wantedKeys, body.id, bodyRenderKey(pantinId, body))) {
        return;
      }
      context.failedBodyIds.add(body.id);
      callbacks.onLoadError(body.name, error instanceof Error ? error.message : String(error));
    });
  });
  void Promise.all(loads).then(() => {
    context.highlights.redraw();
    context.sensorMarkers.redraw();
    frameBodies(context, null);
  });
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

function applyScenePalette(context: ViewportContext, palette: ScenePalette): void {
  context.stage.setPalette(palette);
  context.highlights.setPalette(palette);
  context.conveyors.setSelectionColor(palette.selection);
  context.conveyors.setSignalColours(signalColoursOf(palette));
  context.conveyors.setVolumeColours(palette.volumes);
  context.sensorMarkers.setColours(signalColoursOf(palette));
  context.faceHighlights.setPalette(palette);
  context.assemblyTrihedron.setAxisColours(palette.axes);
}

// Remembers the last bodies shown, so that a retry can replay them.
function createBodySync(
  context: ViewportContext,
  loadBytes: MeshBytesLoader,
  callbacks: ViewportCallbacks,
): Pick<Viewport, "showBodies" | "retryFailedBodies"> {
  let lastShown: { pantinId: string | null; bodies: readonly Body[] } = {
    pantinId: null,
    bodies: [],
  };
  return {
    showBodies: (pantinId, bodies) => {
      lastShown = { pantinId, bodies };
      showBodies(context, pantinId, bodies, loadBytes, callbacks);
    },
    retryFailedBodies: () => {
      forgetFailedLoads(context.wantedKeys, context.failedBodyIds);
      showBodies(context, lastShown.pantinId, lastShown.bodies, loadBytes, callbacks);
    },
  };
}

export function createViewport(
  canvas: HTMLCanvasElement,
  loadBytes: MeshBytesLoader,
  callbacks: ViewportCallbacks,
  palette: ScenePalette,
): Viewport {
  const engine = createEngine(canvas);
  const scene = new Scene(engine);
  const context = createContext(
    scene,
    canvas,
    {
      onDragged: callbacks.onPlacementDragged,
      onDragEnded: callbacks.onPlacementDragEnded,
    },
    palette,
  );
  listenToPicks(context, callbacks);
  applyPosesEachFrame(context);
  const navigation = navigationOf(context, canvas);
  const setRendering = createRenderSwitch(engine, scene);
  return {
    ...createBodySync(context, loadBytes, callbacks),
    frameBodies: (bodyIds) => frameBodies(context, bodyIds),
    pushPoses: (snapshot) => pushSnapshot(context, snapshot),
    clearPoses: () => forgetPoses(context),
    setSelectedBodies: (bodyIds) => context.highlights.setSelectedBodies(bodyIds),
    setHiddenBodies: (bodyIds) => hideBodies(context, bodyIds),
    showJointPreview: (preview) => context.highlights.setJointPreview(preview),
    showSensorMarkers: (markers) => context.sensorMarkers.show(markers),
    showConveyorObjects: (items) => context.conveyors.show(items),
    setSelectedConveyor: (key) => context.conveyors.select(key),
    showTagStates: (values) => {
      context.sensorMarkers.setStates(values);
      context.conveyors.setStates(values);
    },
    setRendering,
    showAssemblyFrame: (target) => context.assemblyTrihedron.show(target),
    showPlacementGizmo: (spec) => context.placementGizmo.show(spec),
    releasePlacementGizmo: () => context.placementGizmo.release(),
    setNavigation: (settings) => navigation.apply(settings),
    showView: (angles) => navigation.showView(angles),
    onCameraOrientation: (listener) => navigation.onOrientation(listener),
    setAlignmentPicking: (active) => {
      context.alignmentPicking = active;
    },
    showFaceHighlights: (highlights) => context.faceHighlights.show(highlights),
    setScenePalette: (next) => applyScenePalette(context, next),
  };
}
