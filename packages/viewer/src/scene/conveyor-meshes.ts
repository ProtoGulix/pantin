import "@babylonjs/core/Rendering/edgesRenderer.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { beamLookFor, isBeamOn } from "../conveyors/beam-appearance.ts";
import type { DrawingItem, DrawingPart } from "../conveyors/conveyor-drawing.ts";
import { ARROW_COLOR, VOLUME_LOOKS } from "../conveyors/volume-appearance.ts";
import { coreDisplacementToBabylon, type Vector3Tuple } from "../frames.ts";
import type { InterpolatedPose } from "../pose-interpolation.ts";

// Belts, guides, emitters, absorbers and the beams of presence sensors (ADR 0043
// point 13). Thin on purpose: what to draw comes from conveyors/, here are only
// the Babylon calls. Every object hangs from a node that takes its frame's
// world pose from its anchor body's pose, fed each frame by followPose. None of
// the meshes is pickable: bodies keep every click (selection is a later slice).

export interface ConveyorMeshes {
  show(items: readonly DrawingItem[]): void;
  /** Tag values from the core, by tag name: a beam is bright on a state tag reading 1. */
  setStates(values: ReadonlyMap<string, number>): void;
  /** The pose of an object (key "kind:id") from the core; objects stand nowhere before their first one. */
  place(key: string, pose: InterpolatedPose): void;
  /** Poses were forgotten: objects hide until they have a pose again. */
  forgetPoses(): void;
}

interface Drawn {
  item: DrawingItem;
  node: TransformNode;
  beams: Mesh[];
}

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

function beamMaterial(scene: Scene, on: boolean) {
  const look = beamLookFor(on);
  const material = new StandardMaterial(on ? "conveyor-beam-on" : "conveyor-beam-off", scene);
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
    beamOn: beamMaterial(scene, true),
    beamOff: beamMaterial(scene, false),
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
  for (const part of item.parts) {
    for (const mesh of buildPart(scene, part, material, beams)) {
      mesh.parent = node;
      mesh.isPickable = false;
    }
  }
  return { item, node, beams };
}

function place(drawn: Drawn, pose: InterpolatedPose): void {
  const babylon = coreDisplacementToBabylon(pose.translation, pose.rotation);
  drawn.node.position.copyFromFloats(...babylon.translation);
  drawn.node.rotationQuaternion?.copyFromFloats(...babylon.rotation);
  drawn.node.setEnabled(true);
}

export function createConveyorMeshes(
  scene: Scene,
  latestPose: (key: string) => InterpolatedPose | undefined,
): ConveyorMeshes {
  const material = createMaterials(scene);
  let drawn: Drawn[] = [];
  const byKey = new Map<string, Drawn>();
  let shownKey: string | null = null;
  let values: ReadonlyMap<string, number> = new Map();

  const paintBeams = () => {
    for (const entry of drawn) {
      const on = isBeamOn(entry.item.stateTag, values);
      for (const beam of entry.beams) {
        beam.material = on ? material.beamOn : material.beamOff;
      }
    }
  };
  const clear = () => {
    for (const entry of drawn) {
      entry.node.dispose(false, false);
    }
    drawn = [];
    byKey.clear();
  };
  return {
    show: (items) => {
      const key = JSON.stringify(items);
      if (key === shownKey) {
        return;
      }
      shownKey = key;
      clear();
      drawn = items.map((item) => drawItem(scene, item, material));
      for (const entry of drawn) {
        byKey.set(entry.item.key, entry);
        const known = latestPose(entry.item.key);
        if (known !== undefined) {
          place(entry, known);
        }
      }
      paintBeams();
    },
    setStates: (next) => {
      values = next;
      paintBeams();
    },
    place: (key, pose) => {
      const entry = byKey.get(key);
      if (entry !== undefined) {
        place(entry, pose);
      }
    },
    forgetPoses: () => {
      for (const entry of drawn) {
        entry.node.setEnabled(false);
      }
    },
  };
}
