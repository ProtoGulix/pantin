import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.js";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { coreDisplacementToBabylon, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import type { SensorMarker } from "../sensors/sensor-markers.ts";
import type { LoadedBody } from "./body-loader.ts";
import { arcAboutAxis, placeAlongAxis } from "./sensor-marker-plan.ts";

// The sensor markers of the 3D view (ADR 0024): a thick stretch of the joint's
// axis over a switch's range, an arc for a pivot, a ring for any other type.
// Each hangs from a node that takes its joint's parent body displacement, and
// is drawn over the bodies (rendering group 1), like the joint arrow. A marker
// lights up when its bit tag reads 1: the viewer never computes the state.

const ON_COLOR = Color3.FromHexString("#58a6ff");
const OFF_COLOR = Color3.FromHexString("#6e7681");
const OVERLAY_GROUP = 1;
// Sizes follow the child body, so that markers read at any scale.
const THICKNESS_SHARE = 0.04;
const ARC_RADIUS_SHARE = 0.3;
const RING_DIAMETER_SHARE = 0.15;
const DEFAULT_EXTENT = 0.1;

export interface SensorMarkers {
  show(markers: readonly SensorMarker[]): void;
  /** After bodies were loaded: markers take their size from the child bodies. */
  redraw(): void;
  /** Tag values from the core, by tag name. */
  setStates(values: ReadonlyMap<string, number>): void;
  setHidden(bodyIds: ReadonlySet<string>): void;
  followPose(bodyId: string, translation: Vector3Tuple, rotation: QuaternionTuple): void;
  resetPose(): void;
}

interface Drawn {
  marker: SensorMarker;
  node: TransformNode;
  meshes: Mesh[];
}

function material(scene: Scene, name: string, color: Color3): StandardMaterial {
  const created = new StandardMaterial(name, scene);
  created.disableLighting = true;
  created.emissiveColor = color;
  return created;
}

function placed(node: TransformNode, start: Vector3Tuple, rotation: QuaternionTuple) {
  node.position = Vector3.FromArray(start);
  node.rotationQuaternion = Quaternion.FromArray(rotation);
}

// The meshes of one marker, under its node, in the parent body's reference frame.
function markerMeshes(scene: Scene, marker: SensorMarker, node: TransformNode, extent: number) {
  const thickness = Math.max(extent * THICKNESS_SHARE, 0.002);
  const { origin, axis, shape } = marker;
  if (shape.kind === "segment") {
    const placement = placeAlongAxis(origin, axis, shape.from, shape.to);
    placed(node, placement.start, placement.rotation);
    // A switch set on one position still shows, as a short slice.
    const height = Math.max(placement.length, thickness / 2);
    const bar = CreateCylinder("sensor-segment", { height, diameter: thickness }, scene);
    bar.position.y = placement.length / 2;
    return [bar];
  }
  if (shape.kind === "arc") {
    const path = arcAboutAxis(origin, axis, shape, extent * ARC_RADIUS_SHARE);
    const points = path.map((point) => Vector3.FromArray(point));
    return [CreateTube("sensor-arc", { path: points, radius: thickness / 2 }, scene)];
  }
  const placement = placeAlongAxis(origin, axis, 0, 0);
  placed(node, placement.start, placement.rotation);
  const diameter = extent * RING_DIAMETER_SHARE;
  return [CreateTorus("sensor-ring", { diameter, thickness: thickness * 0.6 }, scene)];
}

// One node per parent body, carrying that body's displacement: its markers hang from it.
function poseRoots(scene: Scene) {
  const roots = new Map<string, TransformNode>();
  return {
    rootOf: (bodyId: string) => {
      const existing = roots.get(bodyId);
      if (existing !== undefined) {
        return existing;
      }
      const root = new TransformNode(`sensor-root-${bodyId}`, scene);
      root.rotationQuaternion = Quaternion.Identity();
      roots.set(bodyId, root);
      return root;
    },
    follow: (bodyId: string, translation: Vector3Tuple, rotation: QuaternionTuple) => {
      const root = roots.get(bodyId);
      if (root !== undefined) {
        const displacement = coreDisplacementToBabylon(translation, rotation);
        root.position.copyFromFloats(...displacement.translation);
        root.rotationQuaternion?.copyFromFloats(...displacement.rotation);
      }
    },
    /** Drops the nodes of bodies no marker hangs from any more, such as another Pantin's. */
    keepOnly: (bodyIds: ReadonlySet<string>) => {
      for (const [bodyId, root] of roots) {
        if (!bodyIds.has(bodyId)) {
          root.dispose(false, false);
          roots.delete(bodyId);
        }
      }
    },
    reset: () => {
      for (const root of roots.values()) {
        root.position.setAll(0);
        root.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
      }
    },
  };
}

function extentOf(loadedBodies: ReadonlyMap<string, LoadedBody>, bodyId: string): number {
  const bounds = loadedBodies.get(bodyId)?.node.getHierarchyBoundingVectors(true);
  const extent = bounds === undefined ? 0 : bounds.max.subtract(bounds.min).length();
  return Number.isFinite(extent) && extent > 0 ? extent : DEFAULT_EXTENT;
}

// Lit on a bit reading 1 (or always, without a bit), hidden with the child body.
function paintMarkers(
  drawn: readonly Drawn[],
  values: ReadonlyMap<string, number>,
  hidden: ReadonlySet<string>,
  materials: { on: StandardMaterial; off: StandardMaterial },
): void {
  for (const { marker, meshes, node } of drawn) {
    const on = marker.stateTag === null || (values.get(marker.stateTag) ?? 0) >= 0.5;
    for (const mesh of meshes) {
      mesh.material = on ? materials.on : materials.off;
    }
    node.setEnabled(!hidden.has(marker.childBodyId));
  }
}

function drawMarker(
  scene: Scene,
  marker: SensorMarker,
  root: TransformNode,
  extent: number,
): Drawn {
  const node = new TransformNode(`sensor-${marker.sensorId}`, scene);
  node.parent = root;
  const meshes = markerMeshes(scene, marker, node, extent);
  for (const mesh of meshes) {
    mesh.parent = node;
    mesh.isPickable = false;
    mesh.renderingGroupId = OVERLAY_GROUP;
  }
  return { marker, node, meshes };
}

export function createSensorMarkers(
  scene: Scene,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
): SensorMarkers {
  const materials = {
    on: material(scene, "sensor-on-material", ON_COLOR),
    off: material(scene, "sensor-off-material", OFF_COLOR),
  };
  const roots = poseRoots(scene);
  let markers: readonly SensorMarker[] = [];
  let shownKey: string | null = null;
  let drawn: Drawn[] = [];
  let values: ReadonlyMap<string, number> = new Map();
  let hidden: ReadonlySet<string> = new Set();

  const paint = () => paintMarkers(drawn, values, hidden, materials);
  const build = () => {
    for (const { node } of drawn) {
      node.dispose(false, false);
    }
    roots.keepOnly(new Set(markers.map((marker) => marker.parentBodyId)));
    drawn = markers.map((marker) =>
      drawMarker(
        scene,
        marker,
        roots.rootOf(marker.parentBodyId),
        extentOf(loadedBodies, marker.childBodyId),
      ),
    );
    paint();
  };

  return {
    show: (next) => {
      const key = JSON.stringify(next);
      if (key !== shownKey) {
        shownKey = key;
        markers = next;
        // Values of the markers drawn before: the next tag read brings the new ones.
        values = new Map();
        build();
      }
    },
    redraw: build,
    setStates: (next) => {
      values = next;
      paint();
    },
    setHidden: (bodyIds) => {
      hidden = bodyIds;
      paint();
    },
    followPose: roots.follow,
    resetPose: roots.reset,
  };
}
