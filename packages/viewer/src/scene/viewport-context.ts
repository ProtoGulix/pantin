import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { PoseInterpolator } from "../pose-interpolation.ts";
import { type BodyHighlights, createBodyHighlights } from "./body-highlights.ts";
import type { LoadedBody } from "./body-loader.ts";
import { createCamera } from "./camera-framing.ts";
import { type CameraView, createCameraView } from "./camera-view.ts";
import { createFaceHighlights, type FaceHighlights } from "./face-highlights.ts";
import {
  createPlacementGizmo,
  type PlacementGizmo,
  type PlacementGizmoCallbacks,
} from "./placement-gizmo.ts";
import { createSensorMarkers, type SensorMarkers } from "./sensor-markers.ts";
import { createStage, type Stage } from "./stage.ts";

// What the viewport holds together, split from viewport.ts.

export interface ViewportContext {
  scene: Scene;
  camera: ArcRotateCamera;
  view: CameraView;
  stage: Stage;
  // What each body should show (set as soon as a load starts, to skip duplicates).
  wantedKeys: Map<string, string>;
  loadedBodies: Map<string, LoadedBody>;
  bodyIdByMesh: Map<AbstractMesh, string>;
  poses: PoseInterpolator;
  highlights: BodyHighlights;
  sensorMarkers: SensorMarkers;
  placementGizmo: PlacementGizmo;
  hiddenBodyIds: ReadonlySet<string>;
  // While aligning (ADR 0035), a click is a pick, not a selection.
  alignmentPicking: boolean;
  faceHighlights: FaceHighlights;
}

export function createContext(
  scene: Scene,
  canvas: HTMLCanvasElement,
  placementCallbacks: PlacementGizmoCallbacks,
): ViewportContext {
  const loadedBodies = new Map<string, LoadedBody>();
  const poses = new PoseInterpolator();
  const latestPose = (bodyId: string) => poses.latestPose(bodyId);
  const camera = createCamera(scene);
  return {
    scene,
    camera,
    view: createCameraView(scene, canvas, camera),
    stage: createStage(scene),
    wantedKeys: new Map(),
    loadedBodies,
    bodyIdByMesh: new Map(),
    poses,
    highlights: createBodyHighlights(scene, loadedBodies, latestPose),
    sensorMarkers: createSensorMarkers(scene, loadedBodies, latestPose),
    placementGizmo: createPlacementGizmo(scene, placementCallbacks),
    hiddenBodyIds: new Set(),
    alignmentPicking: false,
    faceHighlights: createFaceHighlights(scene, loadedBodies),
  };
}
