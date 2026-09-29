import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BabylonDisplacement } from "../frames.ts";
import type { ArrowPlacement } from "./scene-plan.ts";

// The arrow of the previewed joint: a dot on its origin, a shaft along its
// axis and a head on the positive side. Drawn over the bodies (rendering
// group 1), since the axis usually runs inside them. It hangs from a node
// that takes the parent body's displacement, so it moves with that body.

const ARROW_COLOR = Color3.FromHexString("#ffd33d");
const OVERLAY_GROUP = 1;

export interface JointArrow {
  show(placement: ArrowPlacement): void;
  hide(): void;
  /** The parent body's displacement, already in the Babylon frame. */
  follow(displacement: BabylonDisplacement): void;
}

function arrowMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("joint-arrow-material", scene);
  material.disableLighting = true;
  material.emissiveColor = ARROW_COLOR;
  return material;
}

function arrowParts(scene: Scene, length: number, material: StandardMaterial): Mesh[] {
  const headLength = length * 0.2;
  const shaftLength = length - headLength;
  const shaft = CreateCylinder(
    "joint-arrow-shaft",
    { height: shaftLength, diameter: length * 0.02 },
    scene,
  );
  shaft.position.y = shaftLength / 2;
  const head = CreateCylinder(
    "joint-arrow-head",
    { height: headLength, diameterTop: 0, diameterBottom: length * 0.07 },
    scene,
  );
  head.position.y = shaftLength + headLength / 2;
  const dot = CreateSphere("joint-arrow-origin", { diameter: length * 0.06 }, scene);
  const parts = [shaft, head, dot];
  for (const part of parts) {
    part.material = material;
    part.isPickable = false;
    part.renderingGroupId = OVERLAY_GROUP;
  }
  return parts;
}

export function createJointArrow(scene: Scene): JointArrow {
  const root = new TransformNode("joint-arrow", scene);
  root.rotationQuaternion = Quaternion.Identity();
  const material = arrowMaterial(scene);
  let geometry: TransformNode | null = null;
  // The store redraws on every change; the meshes are rebuilt only when the
  // arrow itself changes.
  let shownKey: string | null = null;
  const hide = () => {
    geometry?.dispose(false, false);
    geometry = null;
    shownKey = null;
  };
  return {
    show: (placement) => {
      const key = JSON.stringify(placement);
      if (key === shownKey) {
        return;
      }
      hide();
      shownKey = key;
      geometry = new TransformNode("joint-arrow-geometry", scene);
      geometry.parent = root;
      geometry.position = Vector3.FromArray(placement.start);
      geometry.rotationQuaternion = Quaternion.FromArray(placement.rotation);
      for (const part of arrowParts(scene, placement.length, material)) {
        part.parent = geometry;
      }
    },
    hide,
    follow: ({ translation, rotation }) => {
      root.position.copyFromFloats(...translation);
      root.rotationQuaternion?.copyFromFloats(...rotation);
    },
  };
}
