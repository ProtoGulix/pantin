import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { PRODUCT_MATERIALS, type ProductMaterial, type ProductPose } from "@pantin/protocol";
import {
  PRODUCT_LOOKS,
  productBoxDimensions,
  productSizeKey,
} from "../conveyors/product-appearance.ts";
import { coreDisplacementToBabylon, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import type { InterpolatedPose } from "../pose-interpolation.ts";

// The products of the pose stream (ADR 0043 point 13), one box mesh each. A mesh
// is created when its product first appears and disposed when it is gone, and
// is reused as long as the product id and size stay the same; materials are
// shared per material name. The pose of each frame comes from an interpolator
// kept by the viewport (smoothed like bodies); this module only places meshes.
// Products are not pickable: bodies keep every click.

export interface ProductMeshes {
  /** Creates, keeps or disposes meshes so that exactly these products are shown. */
  sync(products: readonly ProductPose[]): void;
  place(productId: string, pose: InterpolatedPose): void;
  /** Disposes every product mesh (another Pantin, or none). */
  clear(): void;
}

interface Shown {
  mesh: Mesh;
  sizeKey: string;
}

function createMaterials(scene: Scene): Map<ProductMaterial, PBRMaterial> {
  const materials = new Map<ProductMaterial, PBRMaterial>();
  for (const name of PRODUCT_MATERIALS) {
    const look = PRODUCT_LOOKS[name];
    const material = new PBRMaterial(`product-${name}`, scene);
    material.albedoColor = Color3.FromHexString(look.albedo);
    material.metallic = look.metallic;
    material.roughness = look.roughness;
    materials.set(name, material);
  }
  return materials;
}

function setPose(mesh: Mesh, translation: Vector3Tuple, rotation: QuaternionTuple): void {
  const babylon = coreDisplacementToBabylon(translation, rotation);
  mesh.position.copyFromFloats(...babylon.translation);
  mesh.rotationQuaternion?.copyFromFloats(...babylon.rotation);
}

export function createProductMeshes(scene: Scene, shadows: ShadowGenerator): ProductMeshes {
  const materials = createMaterials(scene);
  const shown = new Map<string, Shown>();

  const dispose = (productId: string) => {
    const entry = shown.get(productId);
    if (entry !== undefined) {
      shadows.removeShadowCaster(entry.mesh);
      // Materials are shared: only the mesh goes.
      entry.mesh.dispose(false, false);
      shown.delete(productId);
    }
  };
  const create = (product: ProductPose): Shown => {
    const mesh = CreateBox(
      `product-${product.productId}`,
      productBoxDimensions(product.size),
      scene,
    );
    mesh.rotationQuaternion = Quaternion.Identity();
    mesh.isPickable = false;
    mesh.material = materials.get(product.material) ?? null;
    shadows.addShadowCaster(mesh, false);
    // At its first pose at once: the interpolator may only reach it next frame.
    setPose(mesh, product.translation, product.rotation);
    return { mesh, sizeKey: productSizeKey(product) };
  };
  return {
    sync: (products) => {
      const present = new Set(products.map((product) => product.productId));
      for (const productId of [...shown.keys()]) {
        if (!present.has(productId)) {
          dispose(productId);
        }
      }
      for (const product of products) {
        if (shown.get(product.productId)?.sizeKey !== productSizeKey(product)) {
          dispose(product.productId);
          shown.set(product.productId, create(product));
        }
      }
    },
    place: (productId, pose) => {
      const entry = shown.get(productId);
      if (entry !== undefined) {
        setPose(entry.mesh, pose.translation, pose.rotation);
      }
    },
    clear: () => {
      for (const productId of [...shown.keys()]) {
        dispose(productId);
      }
    },
  };
}
