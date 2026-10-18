import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

// Thick strokes in the halo colour first, then the fill: legible over any grey.
function drawHaloedText(texture: DynamicTexture, text: string, color: string, halo: string): void {
  const context = texture.getContext();
  context.font = "bold 56px sans-serif";
  context.lineJoin = "round";
  context.lineWidth = 10;
  context.strokeStyle = halo;
  const left = 32 - context.measureText(text).width / 2;
  context.strokeText(text, left, 50);
  context.fillStyle = color;
  context.fillText(text, left, 50);
  texture.update(true);
}

// A glyph on a transparent texture, lit by itself: the material of a billboard label.
export function createLabelMaterial(
  scene: Scene,
  name: string,
  text: string,
  color: string,
  halo?: string,
): StandardMaterial {
  const texture = new DynamicTexture(`${name}-texture`, 64, scene, true);
  if (halo === undefined) {
    texture.drawText(text, null, 50, "bold 48px sans-serif", color, "transparent", true);
  } else {
    drawHaloedText(texture, text, color, halo);
  }
  texture.hasAlpha = true;
  const material = new StandardMaterial(`${name}-material`, scene);
  material.disableLighting = true;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  return material;
}

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
  const plane = CreatePlane(name, { size }, scene);
  plane.material = createLabelMaterial(scene, name, text, color);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  return plane;
}
