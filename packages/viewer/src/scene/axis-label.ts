import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

// The letter at the tip of an axis (ADR 0057): where red and green cannot be
// told apart by colour alone, the letter is the cue. A billboard, so it always
// faces the camera; `name` makes the mesh and its material findable.
export function createAxisLabel(
  scene: Scene,
  name: string,
  text: string,
  color: string,
  size: number,
): Mesh {
  const texture = new DynamicTexture(`${name}-texture`, 64, scene, true);
  texture.drawText(text, null, 50, "bold 48px sans-serif", color, "transparent", true);
  texture.hasAlpha = true;
  const material = new StandardMaterial(`${name}-material`, scene);
  material.disableLighting = true;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  const plane = CreatePlane(name, { size }, scene);
  plane.material = material;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  return plane;
}
