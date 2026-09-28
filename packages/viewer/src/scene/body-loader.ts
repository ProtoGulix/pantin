import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
// Side-effect imports: they register the .glb and .stl loader plugins.
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import "@babylonjs/loaders/STL/stlFileLoader.js";
import type { Body } from "@pantin/protocol";
import { bodyNodeTransform, toBabylonMatrixArray } from "../frames.ts";

export interface LoadedBody {
  // Parent of everything the loader produced; carries the frame conversion.
  node: TransformNode;
  meshes: AbstractMesh[];
  dispose(): void;
}

// STL has no material; a light neutral grey reads well under the stage lights.
function applyDefaultMaterial(scene: Scene, body: Body, meshes: AbstractMesh[]): void {
  const material = new PBRMaterial(`body-material:${body.id}`, scene);
  material.albedoColor = Color3.FromHexString("#b9bec7");
  material.metallic = 0.1;
  material.roughness = 0.55;
  for (const mesh of meshes) {
    mesh.material ??= material;
  }
}

function applyFrameConversion(node: TransformNode, body: Body): void {
  const { format, upAxis, unit } = body.source;
  const matrix = Matrix.FromArray(toBabylonMatrixArray(bodyNodeTransform(format, upAxis, unit)));
  const scaling = new Vector3();
  const rotation = new Quaternion();
  const translation = new Vector3();
  // A rotation times a positive uniform scale (frames.ts), so this is exact.
  matrix.decompose(scaling, rotation, translation);
  node.scaling = scaling;
  node.rotationQuaternion = rotation;
  node.position = translation;
}

function parentLoaderRoots(container: AssetContainer, node: TransformNode): void {
  // For glTF the only root is the loader's "__root__" node, whose own
  // handedness transform is compensated by frames.ts; we keep it untouched.
  for (const root of [...container.meshes, ...container.transformNodes]) {
    if (root.parent === null) {
      root.parent = node;
    }
  }
}

export async function loadBody(scene: Scene, body: Body, bytes: ArrayBuffer): Promise<LoadedBody> {
  const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, {
    pluginExtension: `.${body.source.format}`,
    name: body.source.fileName,
  });
  const node = new TransformNode(`body:${body.id}`, scene);
  applyFrameConversion(node, body);
  parentLoaderRoots(container, node);
  const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  if (body.source.format === "stl") {
    applyDefaultMaterial(scene, body, meshes);
  }
  for (const mesh of meshes) {
    mesh.receiveShadows = true;
  }
  container.addAllToScene();
  return {
    node,
    meshes,
    dispose: () => {
      container.dispose();
      node.dispose(false, true);
    },
  };
}
