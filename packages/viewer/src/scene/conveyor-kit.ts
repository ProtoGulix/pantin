import type { Scene } from "@babylonjs/core/scene.js";
import { volumeLooksFor } from "../conveyors/volume-appearance.ts";
import type { ConveyorVolumeColours } from "../theme/data-palette.ts";
import { createVolumeGlyphs, type VolumeGlyphs } from "./volume-glyphs.ts";
import {
  createVolumeMaterials,
  type VolumeLooks,
  type VolumeMaterials,
} from "./volume-materials.ts";

// What drawing a volume needs, and what a theme change replaces.
export interface Kit {
  materials: VolumeMaterials;
  looks: VolumeLooks;
  glyphs: VolumeGlyphs;
}

export function createKit(scene: Scene, colours: ConveyorVolumeColours): Kit {
  const looks = volumeLooksFor(colours);
  const kit: Kit = {
    materials: createVolumeMaterials(scene, looks),
    looks,
    glyphs: createVolumeGlyphs(scene, colours.glyph),
  };
  return kit;
}

export function recolourKit(kit: Kit, colours: ConveyorVolumeColours): void {
  kit.looks = volumeLooksFor(colours);
  kit.materials.setLooks(kit.looks);
  kit.glyphs.setColours(colours.glyph);
}
