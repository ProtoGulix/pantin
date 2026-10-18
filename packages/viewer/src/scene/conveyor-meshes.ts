import "@babylonjs/core/Rendering/edgesRenderer.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { isBeamOn } from "../conveyors/beam-appearance.ts";
import type { DrawingItem, DrawingPart } from "../conveyors/conveyor-drawing.ts";
import { ARROW_COLOR, VOLUME_LOOKS } from "../conveyors/volume-appearance.ts";
import { coreDisplacementToBabylon, type Vector3Tuple } from "../frames.ts";
import type { InterpolatedPose } from "../pose-interpolation.ts";
import type { SignalColours } from "../theme/signal-look.ts";
import { type BeamMaterials, createBeamMaterials } from "./beam-materials.ts";

// Belts, guides, emitters, absorbers and the beams of presence sensors (ADR 0043
// point 13). Thin on purpose: what to draw comes from conveyors/, here are only
// the Babylon calls. Every object hangs from a node that takes its frame's
// world pose from its anchor body's pose, fed each frame by followPose. A click
// picks them with the bodies, nearest first (viewport.ts); keyOfMesh says which
// object a picked mesh belongs to.

export interface ConveyorMeshes {
  show(items: readonly DrawingItem[]): void;
  /** Tag values from the core, by tag name: a beam is bright on a state tag reading 1. */
  setStates(values: ReadonlyMap<string, number>): void;
  /** The pose of an object (key "kind:id") from the core; objects stand nowhere before their first one. */
  place(key: string, pose: InterpolatedPose): void;
  /** Poses were forgotten: objects hide until they have a pose again. */
  forgetPoses(): void;
  /** The object ("kind:id") a mesh belongs to, or null for any other mesh. */
  keyOfMesh(mesh: AbstractMesh): string | null;
  /** Outlines the object of the selection (key "kind:id"); null removes the outline. */
  select(key: string | null): void;
  /** The theme changed: the outline takes the selection colour (hex). */
  setSelectionColor(hex: string): void;
  /** The theme changed: the beams take its signal-on and signal-off colours. */
  setSignalColours(colours: SignalColours): void;
}

interface Drawn {
  item: DrawingItem;
  node: TransformNode;
  beams: Mesh[];
  meshes: Mesh[];
}

// Scene units (metres): visible on a belt, still thin on a 1 cm beam.
const SELECTION_OUTLINE_WIDTH = 0.008;

function volumeMaterial(scene: Scene, style: keyof typeof VOLUME_LOOKS) {
  const look = VOLUME_LOOKS[style];
  if (style === "belt" || style === "guide") {
    const material = new PBRMaterial(`conveyor-${style}`, scene);
    material.albedoColor = Color3.FromHexString(look.color);
    material.metallic = 0;
    material.roughness = 0.8;
    material.alpha = look.alpha;
    return material;
  }
  const material = new StandardMaterial(`conveyor-${style}`, scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.FromHexString(look.color);
  material.alpha = look.alpha;
  return material;
}

function createMaterials(scene: Scene) {
  const arrow = new StandardMaterial("conveyor-arrow", scene);
  arrow.disableLighting = true;
  arrow.emissiveColor = Color3.FromHexString(ARROW_COLOR);
  return {
    volumes: {
      belt: volumeMaterial(scene, "belt"),
      guide: volumeMaterial(scene, "guide"),
      emitter: volumeMaterial(scene, "emitter"),
      absorber: volumeMaterial(scene, "absorber"),
      receiver: volumeMaterial(scene, "receiver"),
    },
    arrow,
  };
}

type Materials = ReturnType<typeof createMaterials>;

function fromTuple([x, y, z]: Vector3Tuple): Vector3 {
  return new Vector3(x, y, z);
}

// A shaft and a cone head, both cylinders turned from Babylon Y onto the arrow's axis.
function buildArrow(
  scene: Scene,
  part: Extract<DrawingPart, { kind: "arrow" }>,
  material: Materials,
) {
  const tail = fromTuple(part.tail);
  const tip = fromTuple(part.tip);
  const direction = tip.subtract(tail).normalize();
  const turn = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, new Quaternion());
  const total = Vector3.Distance(tail, tip);
  const shaftLength = total - part.headLength;
  const shaft = CreateCylinder(
    "conveyor-arrow-shaft",
    { height: shaftLength, diameter: part.shaftDiameter },
    scene,
  );
  shaft.position = tail.add(direction.scale(shaftLength / 2));
  const head = CreateCylinder(
    "conveyor-arrow-head",
    { height: part.headLength, diameterTop: 0, diameterBottom: part.headDiameter },
    scene,
  );
  head.position = tip.subtract(direction.scale(part.headLength / 2));
  for (const mesh of [shaft, head]) {
    mesh.rotationQuaternion = turn.clone();
    mesh.material = material.arrow;
  }
  return [shaft, head];
}

function buildBox(scene: Scene, part: Extract<DrawingPart, { kind: "box" }>, material: Materials) {
  const [width, height, depth] = part.size;
  const box = CreateBox("conveyor-box", { width, height, depth }, scene);
  box.position = fromTuple(part.centre);
  box.material = material.volumes[part.style];
  const edges = VOLUME_LOOKS[part.style].edges;
  if (edges !== null) {
    box.enableEdgesRendering();
    box.edgesWidth = 3;
    box.edgesColor = Color4.FromHexString(`${edges}ff`);
  }
  return [box];
}

function buildPart(scene: Scene, part: DrawingPart, material: Materials, beams: Mesh[]): Mesh[] {
  if (part.kind === "box") {
    return buildBox(scene, part, material);
  }
  if (part.kind === "arrow") {
    return buildArrow(scene, part, material);
  }
  const beam = CreateCylinder(
    "conveyor-beam",
    { height: part.length, diameter: part.diameter },
    scene,
  );
  beam.position = fromTuple(part.centre);
  beams.push(beam);
  return [beam];
}

function drawItem(scene: Scene, item: DrawingItem, material: Materials): Drawn {
  const node = new TransformNode(`conveyor-${item.key}`, scene);
  node.rotationQuaternion = Quaternion.Identity();
  node.setEnabled(false);
  const beams: Mesh[] = [];
  const meshes: Mesh[] = [];
  for (const part of item.parts) {
    for (const mesh of buildPart(scene, part, material, beams)) {
      mesh.parent = node;
      mesh.isPickable = true;
      meshes.push(mesh);
    }
  }
  return { item, node, beams, meshes };
}

function place(drawn: Drawn, pose: InterpolatedPose): void {
  const babylon = coreDisplacementToBabylon(pose.translation, pose.rotation);
  drawn.node.position.copyFromFloats(...babylon.translation);
  drawn.node.rotationQuaternion?.copyFromFloats(...babylon.rotation);
  drawn.node.setEnabled(true);
}

function indexEntry(
  entry: Drawn,
  byKey: Map<string, Drawn>,
  keyByMesh: Map<AbstractMesh, string>,
): void {
  byKey.set(entry.item.key, entry);
  for (const mesh of entry.meshes) {
    keyByMesh.set(mesh, entry.item.key);
  }
}

function placeKnown(entry: Drawn, latestPose: (key: string) => InterpolatedPose | undefined): void {
  const known = latestPose(entry.item.key);
  if (known !== undefined) {
    place(entry, known);
  }
}

function paintBeams(
  drawn: readonly Drawn[],
  values: ReadonlyMap<string, number>,
  beamMaterials: BeamMaterials,
): void {
  for (const entry of drawn) {
    const on = isBeamOn(entry.item.stateTag, values);
    for (const beam of entry.beams) {
      beamMaterials.paint(beam, on);
    }
  }
}

function paintSelection(
  drawn: readonly Drawn[],
  selectedKey: string | null,
  outlineColor: Color3,
): void {
  for (const entry of drawn) {
    const selected = entry.item.key === selectedKey;
    for (const mesh of entry.meshes) {
      mesh.renderOutline = selected;
      mesh.outlineColor = outlineColor;
      mesh.outlineWidth = SELECTION_OUTLINE_WIDTH;
    }
  }
}

function placeByKey(byKey: ReadonlyMap<string, Drawn>, key: string, pose: InterpolatedPose): void {
  const entry = byKey.get(key);
  if (entry !== undefined) {
    place(entry, pose);
  }
}

function disposeDrawn(drawn: readonly Drawn[]): void {
  for (const entry of drawn) {
    entry.node.dispose(false, false);
  }
}

function hideDrawn(drawn: readonly Drawn[]): void {
  for (const entry of drawn) {
    entry.node.setEnabled(false);
  }
}

export function createConveyorMeshes(
  scene: Scene,
  latestPose: (key: string) => InterpolatedPose | undefined,
  selectionHex: string,
  signalColours: SignalColours,
): ConveyorMeshes {
  let outlineColor = Color3.FromHexString(selectionHex);
  const material = createMaterials(scene);
  const beamMaterials = createBeamMaterials(scene, signalColours);
  let drawn: Drawn[] = [];
  const byKey = new Map<string, Drawn>();
  const keyByMesh = new Map<AbstractMesh, string>();
  let shownKey: string | null = null;
  let selectedKey: string | null = null;
  let values: ReadonlyMap<string, number> = new Map();
  const show = (items: readonly DrawingItem[]) => {
    disposeDrawn(drawn);
    byKey.clear();
    keyByMesh.clear();
    drawn = items.map((item) => drawItem(scene, item, material));
    for (const entry of drawn) {
      indexEntry(entry, byKey, keyByMesh);
      placeKnown(entry, latestPose);
    }
    paintBeams(drawn, values, beamMaterials);
    paintSelection(drawn, selectedKey, outlineColor);
  };
  return {
    show: (items) => {
      const key = JSON.stringify(items);
      if (key !== shownKey) {
        shownKey = key;
        show(items);
      }
    },
    setStates: (next) => {
      values = next;
      paintBeams(drawn, values, beamMaterials);
    },
    place: (key, pose) => placeByKey(byKey, key, pose),
    forgetPoses: () => hideDrawn(drawn),
    keyOfMesh: (mesh) => keyByMesh.get(mesh) ?? null,
    select: (key) => {
      selectedKey = key;
      paintSelection(drawn, selectedKey, outlineColor);
    },
    setSignalColours: (next) => {
      beamMaterials.setColours(next);
      paintBeams(drawn, values, beamMaterials);
    },
    setSelectionColor: (hex) => {
      outlineColor = Color3.FromHexString(hex);
      paintSelection(drawn, selectedKey, outlineColor);
    },
  };
}
