import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { PoseInterpolator } from "../pose-interpolation.ts";
import { type AssemblyTrihedron, createAssemblyTrihedron } from "./assembly-trihedron.ts";
import { type BodyHighlights, createBodyHighlights } from "./body-highlights.ts";
import type { LoadedBody } from "./body-loader.ts";
import { createCamera } from "./camera-framing.ts";
import { type CameraView, createCameraView } from "./camera-view.ts";
import { type ConveyorMeshes, createConveyorMeshes } from "./conveyor-meshes.ts";
import { createFaceHighlights, type FaceHighlights } from "./face-highlights.ts";
import {
  createPlacementGizmo,
  type PlacementGizmo,
  type PlacementGizmoCallbacks,
} from "./placement-gizmo.ts";
import { createProductMeshes, type ProductMeshes } from "./product-meshes.ts";
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
  // Products blend in their own interpolator: their ids ("p1"...) are not body ids.
  productPoses: PoseInterpolator;
  // Phase 6 objects (belts...) blend in a third one, keyed "kind:id".
  objectPoses: PoseInterpolator;
  productMeshes: ProductMeshes;
  conveyors: ConveyorMeshes;
  highlights: BodyHighlights;
  sensorMarkers: SensorMarkers;
  placementGizmo: PlacementGizmo;
  assemblyTrihedron: AssemblyTrihedron;
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
  const objectPoses = new PoseInterpolator();
  const latestPose = (bodyId: string) => poses.latestPose(bodyId);
  const camera = createCamera(scene);
  const stage = createStage(scene);
  return {
    scene,
    camera,
    view: createCameraView(scene, canvas, camera),
    stage,
    wantedKeys: new Map(),
    loadedBodies,
    bodyIdByMesh: new Map(),
    poses,
    productPoses: new PoseInterpolator(),
    objectPoses,
    productMeshes: createProductMeshes(scene, stage.shadowGenerator),
    conveyors: createConveyorMeshes(scene, (key) => objectPoses.latestPose(key)),
    highlights: createBodyHighlights(scene, loadedBodies, latestPose),
    sensorMarkers: createSensorMarkers(scene, loadedBodies, latestPose),
    placementGizmo: createPlacementGizmo(scene, placementCallbacks),
    assemblyTrihedron: createAssemblyTrihedron(scene),
    hiddenBodyIds: new Set(),
    alignmentPicking: false,
    faceHighlights: createFaceHighlights(scene, loadedBodies),
  };
}
