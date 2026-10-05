import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { type AssemblyFrameTarget, frameFromInverse } from "../assembly-frame.ts";
import {
  coreDisplacementToBabylon,
  coreToBabylonPosition,
  type QuaternionTuple,
  type Vector3Tuple,
} from "../frames.ts";
import { invertTransform, type RigidTransform } from "../rigid-transform.ts";

// The trihedron of the selected assembly's frame (ADR 0042 point 1): X red,
// Y green, Z blue, each tip labelled, over the bodies (rendering group 1, like
// the joint arrow) and of constant size on screen. Thin on purpose: the frame
// itself comes from assembly-frame.ts. It follows the pose of one body of the
// assembly, fed each frame by followPose.

const OVERLAY_GROUP = 1;
// Length of an axis as a share of the view height at the trihedron's distance.
const SCREEN_SHARE = 0.12;
const AXES = [
  { label: "X", color: "#f85149", core: [1, 0, 0] },
  { label: "Y", color: "#3fb950", core: [0, 1, 0] },
  { label: "Z", color: "#58a6ff", core: [0, 0, 1] },
] as const;

export interface AssemblyTrihedron {
  /** The frame to draw, or null to remove it. */
  show(target: AssemblyFrameTarget | null): void;
  /** A body's displayed pose of this frame; only the target body's is used. */
  followPose(bodyId: string, translation: Vector3Tuple, rotation: QuaternionTuple): void;
  /** Poses were forgotten: hidden until the target body has a pose again. */
  forgetPoses(): void;
}

function labelPlane(scene: Scene, text: string, color: string): Mesh {
  const texture = new DynamicTexture(`trihedron-label-${text}`, 64, scene, true);
  texture.drawText(text, null, 50, "bold 48px sans-serif", color, "transparent", true);
  texture.hasAlpha = true;
  const material = new StandardMaterial(`trihedron-label-material-${text}`, scene);
  material.disableLighting = true;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  const plane = CreatePlane(`trihedron-label-${text}`, { size: 0.3 }, scene);
  plane.material = material;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  return plane;
}

// One axis of unit length, in the Babylon frame, under `root`.
function buildAxis(scene: Scene, root: TransformNode, axis: (typeof AXES)[number]): Mesh[] {
  const material = new StandardMaterial(`trihedron-material-${axis.label}`, scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.FromHexString(axis.color);
  const direction = Vector3.FromArray(coreToBabylonPosition(axis.core));
  const shaft = CreateCylinder(
    `trihedron-axis-${axis.label}`,
    { height: 1, diameter: 0.03 },
    scene,
  );
  // A cylinder stands along Y: turn it onto the axis, its centre half way.
  const turn = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, new Quaternion());
  shaft.rotationQuaternion = turn;
  shaft.position = direction.scale(0.5);
  shaft.material = material;
  const label = labelPlane(scene, axis.label, axis.color);
  label.position = direction.scale(1.2);
  const parts = [shaft, label];
  for (const part of parts) {
    part.parent = root;
    part.isPickable = false;
    part.renderingGroupId = OVERLAY_GROUP;
  }
  return parts;
}

// World size of one unit of the trihedron so that it keeps its size on screen.
function worldSize(scene: Scene, at: Vector3): number {
  const camera = scene.activeCamera;
  if (camera === null) {
    return 1;
  }
  if (camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
    // camera-view.ts sets the bounds from the view each frame (ADR 0036); the
    // fallback only covers a camera whose bounds were never set.
    return SCREEN_SHARE * ((camera.orthoTop ?? 1) - (camera.orthoBottom ?? -1));
  }
  return SCREEN_SHARE * 2 * Vector3.Distance(camera.globalPosition, at) * Math.tan(camera.fov / 2);
}

export function createAssemblyTrihedron(scene: Scene): AssemblyTrihedron {
  let root: TransformNode | null = null;
  let target: AssemblyFrameTarget | null = null;
  // B^-1 of the target body, computed when the target changes, not every frame.
  let inversePlacement: RigidTransform | undefined;
  let observer: ReturnType<Scene["onBeforeRenderObservable"]["add"]> | null = null;

  const dispose = () => {
    observer?.remove();
    observer = null;
    root?.dispose(false, true);
    root = null;
  };
  const build = () => {
    const node = new TransformNode("assembly-trihedron", scene);
    node.rotationQuaternion = Quaternion.Identity();
    node.setEnabled(false);
    for (const axis of AXES) {
      buildAxis(scene, node, axis);
    }
    observer = scene.onBeforeRenderObservable.add(() => {
      node.scaling.setAll(worldSize(scene, node.position));
    });
    root = node;
  };
  return {
    show: (next) => {
      if (next?.bodyId === target?.bodyId) {
        target = next;
        inversePlacement = next?.bodyPlacement && invertTransform(next.bodyPlacement);
        return;
      }
      dispose();
      target = next;
      inversePlacement = next?.bodyPlacement && invertTransform(next.bodyPlacement);
      if (next !== null) {
        build();
      }
    },
    followPose: (bodyId, translation, rotation) => {
      if (root === null || target === null || bodyId !== target.bodyId) {
        return;
      }
      const frame = frameFromInverse({ translation, rotation }, inversePlacement);
      const babylon = coreDisplacementToBabylon(frame.translation, frame.rotation);
      root.position.copyFromFloats(...babylon.translation);
      root.rotationQuaternion?.copyFromFloats(...babylon.rotation);
      root.setEnabled(true);
    },
    forgetPoses: () => root?.setEnabled(false),
  };
}
