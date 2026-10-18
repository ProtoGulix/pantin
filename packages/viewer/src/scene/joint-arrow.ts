import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BabylonDisplacement } from "../frames.ts";
import type { ScenePalette } from "../theme/scene-palette.ts";
import { type ArrowPart, planJointArrowParts } from "./joint-arrow-plan.ts";
import type { ArrowPlacement } from "./scene-plan.ts";

// The arrow of the previewed joint: a dot on its origin, a shaft along its
// axis and a head on the positive side, plus a collar disc at the shaft's base
// when a drive moves the joint (always the selection blue, ADR 0057). Drawn
// over the bodies (rendering group 1), since the axis usually runs inside them.
// It hangs from a node that takes the parent body's displacement, so it moves
// with that body.

const OVERLAY_GROUP = 1;

export interface JointArrow {
  show(placement: ArrowPlacement, driven: boolean): void;
  hide(): void;
  /** The theme changed: the material takes its selection blue. */
  setPalette(palette: ScenePalette): void;
  /** The parent body's displacement, already in the Babylon frame. */
  follow(displacement: BabylonDisplacement): void;
}

function partMesh(scene: Scene, part: ArrowPart): Mesh {
  switch (part.kind) {
    case "origin":
      return CreateSphere("joint-arrow-origin", { diameter: part.diameter }, scene);
    case "head":
      return CreateCylinder(
        "joint-arrow-head",
        { height: part.height, diameterTop: 0, diameterBottom: part.diameter },
        scene,
      );
    default:
      return CreateCylinder(
        `joint-arrow-${part.kind}`,
        { height: part.height, diameter: part.diameter },
        scene,
      );
  }
}

function arrowParts(scene: Scene, plan: readonly ArrowPart[], material: StandardMaterial): Mesh[] {
  return plan.map((part) => {
    const mesh = partMesh(scene, part);
    mesh.position.y = part.centreY;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.renderingGroupId = OVERLAY_GROUP;
    return mesh;
  });
}

export function createJointArrow(scene: Scene, palette: ScenePalette): JointArrow {
  const root = new TransformNode("joint-arrow", scene);
  root.rotationQuaternion = Quaternion.Identity();
  const material = new StandardMaterial("joint-arrow-material", scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.FromHexString(palette.selection);
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
    show: (placement, driven) => {
      const key = JSON.stringify([placement, driven]);
      if (key === shownKey) {
        return;
      }
      hide();
      shownKey = key;
      geometry = new TransformNode("joint-arrow-geometry", scene);
      geometry.parent = root;
      geometry.position = Vector3.FromArray(placement.start);
      geometry.rotationQuaternion = Quaternion.FromArray(placement.rotation);
      const plan = planJointArrowParts(placement.length, driven);
      for (const part of arrowParts(scene, plan, material)) {
        part.parent = geometry;
      }
    },
    hide,
    setPalette: (next) => {
      material.emissiveColor = Color3.FromHexString(next.selection);
    },
    follow: ({ translation, rotation }) => {
      root.position.copyFromFloats(...translation);
      root.rotationQuaternion?.copyFromFloats(...rotation);
    },
  };
}
