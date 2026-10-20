import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.js";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { isBitOn } from "../bit-tag.ts";
import { coreDisplacementToBabylon, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import type { SensorMarker } from "../sensors/sensor-markers.ts";
import { type SignalColours, signalColourFor, signalLookFor } from "../theme/signal-look.ts";
import type { LatestPose } from "./body-highlights.ts";
import type { LoadedBody } from "./body-loader.ts";
import { arcAboutAxis, placeAlongAxis } from "./sensor-marker-plan.ts";

// The sensor markers of the 3D view (ADR 0024): a thick stretch of the joint's
// axis over a switch's range, an arc for a pivot, a ring for any other type.
// Each hangs from a node that takes its joint's parent body displacement, and
// is drawn over the bodies (rendering group 1), like the joint arrow. A marker
// lights up when its bit tag reads 1: the viewer never computes the state. On
// it is the signal-on colour, thick and opaque; off, a neutral, thin and
// translucent (ADR 0057 rule 3), so the colour is not the only cue.

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
  /** The theme changed: the markers take its signal-on and signal-off colours. */
  setColours(colours: SignalColours): void;
  followPose(bodyId: string, translation: Vector3Tuple, rotation: QuaternionTuple): void;
  /** Poses were forgotten: markers are hidden until their parent body has a pose again. */
  forgetPoses(): void;
}

interface Drawn {
  marker: SensorMarker;
  node: TransformNode;
  meshes: Mesh[];
  /** The state it was drawn in: the thickness follows it. */
  on: boolean;
  /** Its child body's size, kept so that a flip does not measure the body again. */
  extent: number;
}

function applyLook(material: StandardMaterial, on: boolean, colours: SignalColours): void {
  material.emissiveColor = Color3.FromHexString(signalColourFor(on, colours));
  material.alpha = signalLookFor(on).alpha;
}

function material(scene: Scene, on: boolean, colours: SignalColours): StandardMaterial {
  const created = new StandardMaterial(on ? "sensor-on-material" : "sensor-off-material", scene);
  created.disableLighting = true;
  applyLook(created, on, colours);
  return created;
}

interface SignalMaterials {
  on: StandardMaterial;
  off: StandardMaterial;
  setColours(colours: SignalColours): void;
}

function signalMaterials(scene: Scene, colours: SignalColours): SignalMaterials {
  const on = material(scene, true, colours);
  const off = material(scene, false, colours);
  return {
    on,
    off,
    setColours: (next) => {
      applyLook(on, true, next);
      applyLook(off, false, next);
    },
  };
}

// A marker without a bit is always lit; the same rule as the tree's disc.
function isMarkerOn(marker: SensorMarker, values: ReadonlyMap<string, number>): boolean {
  return marker.stateTag === null || isBitOn(values.get(marker.stateTag) ?? 0);
}

function placed(node: TransformNode, start: Vector3Tuple, rotation: QuaternionTuple) {
  node.position = Vector3.FromArray(start);
  node.rotationQuaternion = Quaternion.FromArray(rotation);
}

// The meshes of one marker, under its node, in the parent body's reference frame.
function markerMeshes(
  scene: Scene,
  marker: SensorMarker,
  node: TransformNode,
  extent: number,
  on: boolean,
) {
  const thickness = Math.max(extent * THICKNESS_SHARE, 0.002) * signalLookFor(on).thicknessScale;
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
// A root without a pose is disabled: the reference placement is where no body
// stands once assemblies are placed (ADR 0033), so drawing there would mislead.
function poseRoots(scene: Scene, latestPose: LatestPose) {
  const roots = new Map<string, TransformNode>();
  const place = (root: TransformNode, translation: Vector3Tuple, rotation: QuaternionTuple) => {
    const displacement = coreDisplacementToBabylon(translation, rotation);
    root.position.copyFromFloats(...displacement.translation);
    root.rotationQuaternion?.copyFromFloats(...displacement.rotation);
    root.setEnabled(true);
  };
  return {
    rootOf: (bodyId: string) => {
      const existing = roots.get(bodyId);
      if (existing !== undefined) {
        return existing;
      }
      const root = new TransformNode(`sensor-root-${bodyId}`, scene);
      root.rotationQuaternion = Quaternion.Identity();
      const known = latestPose(bodyId);
      if (known === undefined) {
        root.setEnabled(false);
      } else {
        place(root, known.translation, known.rotation);
      }
      roots.set(bodyId, root);
      return root;
    },
    follow: (bodyId: string, translation: Vector3Tuple, rotation: QuaternionTuple) => {
      const root = roots.get(bodyId);
      if (root !== undefined) {
        place(root, translation, rotation);
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
    forget: () => {
      for (const root of roots.values()) {
        root.setEnabled(false);
      }
    },
  };
}

function extentOf(loadedBodies: ReadonlyMap<string, LoadedBody>, bodyId: string): number {
  const bounds = loadedBodies.get(bodyId)?.node.getHierarchyBoundingVectors(true);
  const extent = bounds === undefined ? 0 : bounds.max.subtract(bounds.min).length();
  return Number.isFinite(extent) && extent > 0 ? extent : DEFAULT_EXTENT;
}

function drawMarker(
  scene: Scene,
  marker: SensorMarker,
  root: TransformNode,
  extent: number,
  on: boolean,
): Drawn {
  const node = new TransformNode(`sensor-${marker.sensorId}`, scene);
  node.parent = root;
  const meshes = markerMeshes(scene, marker, node, extent, on);
  for (const mesh of meshes) {
    mesh.parent = node;
    mesh.isPickable = false;
    mesh.renderingGroupId = OVERLAY_GROUP;
  }
  return { marker, node, meshes, on, extent };
}

function drawOnRoots(
  scene: Scene,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  roots: ReturnType<typeof poseRoots>,
  marker: SensorMarker,
  on: boolean,
  knownExtent?: number,
): Drawn {
  const root = roots.rootOf(marker.parentBodyId);
  const extent = knownExtent ?? extentOf(loadedBodies, marker.childBodyId);
  return drawMarker(scene, marker, root, extent, on);
}

interface PaintInputs {
  values: ReadonlyMap<string, number>;
  hidden: ReadonlySet<string>;
  materials: SignalMaterials;
}

// A marker whose state changed is drawn again: its thickness is its geometry.
// A marker hides with its child body.
function repaintMarkers(
  drawn: readonly Drawn[],
  { values, hidden, materials }: PaintInputs,
  drawOne: (marker: SensorMarker, knownExtent?: number) => Drawn,
): Drawn[] {
  return drawn.map((entry) => {
    const redrawn =
      isMarkerOn(entry.marker, values) === entry.on ? entry : drawOne(entry.marker, entry.extent);
    if (redrawn !== entry) {
      entry.node.dispose(false, false);
    }
    for (const mesh of redrawn.meshes) {
      mesh.material = redrawn.on ? materials.on : materials.off;
    }
    redrawn.node.setEnabled(!hidden.has(redrawn.marker.childBodyId));
    return redrawn;
  });
}

export function createSensorMarkers(
  scene: Scene,
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  latestPose: LatestPose,
  initialColours: SignalColours,
): SensorMarkers {
  const materials = signalMaterials(scene, initialColours);
  const roots = poseRoots(scene, latestPose);
  let markers: readonly SensorMarker[] = [];
  let shownKey: string | null = null;
  let drawn: Drawn[] = [];
  let values: ReadonlyMap<string, number> = new Map();
  let hidden: ReadonlySet<string> = new Set();

  const drawOne = (marker: SensorMarker, knownExtent?: number) =>
    drawOnRoots(scene, loadedBodies, roots, marker, isMarkerOn(marker, values), knownExtent);
  const paint = () => {
    drawn = repaintMarkers(drawn, { values, hidden, materials }, drawOne);
  };
  const build = () => {
    for (const { node } of drawn) {
      node.dispose(false, false);
    }
    roots.keepOnly(new Set(markers.map((marker) => marker.parentBodyId)));
    drawn = markers.map((marker) => drawOne(marker));
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
    setColours: materials.setColours,
    followPose: roots.follow,
    forgetPoses: roots.forget,
  };
}
