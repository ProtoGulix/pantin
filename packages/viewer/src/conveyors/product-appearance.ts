import type { ProductMaterial, ProductPose } from "@pantin/protocol";
import { coreToBabylonPosition, type Vector3Tuple } from "../frames.ts";
import { DATA_COLOURS } from "../theme/data-palette.ts";

// How a product looks (ADR 0043 point 13). Display logic only: the size and the
// material come from the core with every pose.

export interface ProductLook {
  albedo: string;
  metallic: number;
  roughness: number;
}

const ALBEDO = DATA_COLOURS.productAlbedo;

// The scene has no environment map, so a strongly metallic surface would only
// reflect black: the metals keep a low metallic value and differ by shade.
export const PRODUCT_LOOKS: Readonly<Record<ProductMaterial, ProductLook>> = {
  cardboard: { albedo: ALBEDO.cardboard, metallic: 0, roughness: 0.85 },
  plastic: { albedo: ALBEDO.plastic, metallic: 0, roughness: 0.35 },
  wood: { albedo: ALBEDO.wood, metallic: 0, roughness: 0.7 },
  steel: { albedo: ALBEDO.steel, metallic: 0.35, roughness: 0.4 },
  stainless_steel: { albedo: ALBEDO.stainless_steel, metallic: 0.35, roughness: 0.3 },
  aluminium: { albedo: ALBEDO.aluminium, metallic: 0.3, roughness: 0.45 },
  brass: { albedo: ALBEDO.brass, metallic: 0.35, roughness: 0.35 },
  copper: { albedo: ALBEDO.copper, metallic: 0.35, roughness: 0.35 },
};

/**
 * Babylon box dimensions (width along X, height along Y, depth along Z) of a
 * product whose size is [x, y, z] in the core frame (Z up): the same axis swap
 * as every other position, applied to a size.
 */
export function productBoxDimensions(size: Vector3Tuple): {
  width: number;
  height: number;
  depth: number;
} {
  const [width, height, depth] = coreToBabylonPosition(size);
  return { width, height, depth };
}

/** Same size, same mesh: a change of size is a different box. */
export function productSizeKey(product: Pick<ProductPose, "size">): string {
  return product.size.join("x");
}
