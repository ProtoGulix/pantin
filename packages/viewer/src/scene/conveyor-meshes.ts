import "@babylonjs/core/Rendering/edgesRenderer.js";
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
import { coreDisplacementToBabylon, type Vector3Tuple } from "../frames.ts";
import type { InterpolatedPose } from "../pose-interpolation.ts";
import type { ConveyorVolumeColours } from "../theme/data-palette.ts";
import type { SignalColours } from "../theme/signal-look.ts";
import { type BeamMaterials, createBeamMaterials } from "./beam-materials.ts";
import { createKit, type Kit, recolourKit } from "./conveyor-kit.ts";

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
  /** The theme changed: the volumes and their glyphs take its greys. */
  setVolumeColours(colours: ConveyorVolumeColours): void;
}

interface Drawn {
  item: DrawingItem;
  node: TransformNode;
  beams: Mesh[];
  meshes: Mesh[];
}

// Scene units (metres): visible on a belt, still thin on a 1 cm beam.
const SELECTION_OUTLINE_WIDTH = 0.008;

function fromTuple([x, y, z]: Vector3Tuple): Vector3 {
  return new Vector3(x, y, z);
}

// A shaft and a cone head, both cylinders turned from Babylon Y onto the arrow's axis.
function buildArrow(scene: Scene, part: Extract<DrawingPart, { kind: "arrow" }>, kit: Kit) {
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
    mesh.material = kit.materials.arrow;
  }
  return [shaft, head];
}

function buildBox(scene: Scene, part: Extract<DrawingPart, { kind: "box" }>, kit: Kit) {
  const [width, height, depth] = part.size;
  const box = CreateBox("conveyor-box", { width, height, depth }, scene);
  box.position = fromTuple(part.centre);
  box.material = kit.materials.volumes[part.style];
  kit.glyphs.attach(part.style, box, Math.max(width, height, depth));
  const edges = kit.looks[part.style].edges;
  if (edges !== null) {
    box.enableEdgesRendering();
    box.edgesWidth = 3;
    box.edgesColor = Color4.FromHexString(`${edges}ff`);
  }
  return [box];
}

function buildPart(scene: Scene, part: DrawingPart, kit: Kit, beams: Mesh[]): Mesh[] {
  if (part.kind === "box") {
    return buildBox(scene, part, kit);
  }
  if (part.kind === "arrow") {
    return buildArrow(scene, part, kit);
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

function drawItem(scene: Scene, item: DrawingItem, kit: Kit): Drawn {
  const node = new TransformNode(`conveyor-${item.key}`, scene);
  node.rotationQuaternion = Quaternion.Identity();
  node.setEnabled(false);
  const beams: Mesh[] = [];
  const meshes: Mesh[] = [];
  for (const part of item.parts) {
    for (const mesh of buildPart(scene, part, kit, beams)) {
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

function reindex(
  drawn: readonly Drawn[],
  byKey: Map<string, Drawn>,
  keyByMesh: Map<AbstractMesh, string>,
): void {
  byKey.clear();
  keyByMesh.clear();
  for (const entry of drawn) {
    indexEntry(entry, byKey, keyByMesh);
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

function disposeDrawn(drawn: readonly Drawn[], kit: Kit): void {
  for (const entry of drawn) {
    entry.node.dispose(false, false);
  }
  kit.glyphs.forgetAll();
}

function drawAll(
  scene: Scene,
  items: readonly DrawingItem[],
  kit: Kit,
  latestPose: (key: string) => InterpolatedPose | undefined,
): Drawn[] {
  const drawn = items.map((item) => drawItem(scene, item, kit));
  for (const entry of drawn) {
    placeKnown(entry, latestPose);
  }
  return drawn;
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
  volumeColours: ConveyorVolumeColours,
): ConveyorMeshes {
  let outlineColor = Color3.FromHexString(selectionHex);
  const kit = createKit(scene, volumeColours);
  const beamMaterials = createBeamMaterials(scene, signalColours);
  let drawn: Drawn[] = [];
  const byKey = new Map<string, Drawn>();
  const keyByMesh = new Map<AbstractMesh, string>();
  let shown: { key: string; items: readonly DrawingItem[] } | null = null;
  let selectedKey: string | null = null;
  let values: ReadonlyMap<string, number> = new Map();
  const show = (items: readonly DrawingItem[]) => {
    disposeDrawn(drawn, kit);
    drawn = drawAll(scene, items, kit, latestPose);
    reindex(drawn, byKey, keyByMesh);
    paintBeams(drawn, values, beamMaterials);
    paintSelection(drawn, selectedKey, outlineColor);
  };
  return {
    show: (items) => {
      const key = JSON.stringify(items);
      if (key !== shown?.key) {
        shown = { key, items };
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
    setVolumeColours: (next) => {
      recolourKit(kit, next);
      show(shown?.items ?? []);
    },
    setSelectionColor: (hex) => {
      outlineColor = Color3.FromHexString(hex);
      paintSelection(drawn, selectedKey, outlineColor);
    },
  };
}
