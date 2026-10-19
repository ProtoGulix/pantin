import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { VolumeStyle } from "../conveyors/conveyor-drawing.ts";
import { glyphOf, glyphSize } from "../conveyors/volume-glyph.ts";
import type { GlyphColours } from "../theme/data-palette.ts";
import { createLabelMaterial } from "./axis-label.ts";
import { visibleHeightAt } from "./view-height.ts";

// The "+" of an emitter and the "−" of an absorber (ADR 0057), billboards at the
// centre of the volume over the bodies (rendering group 1, like the trihedron).
// Their size follows the view each frame (volume-glyph.ts decides it).

const OVERLAY_GROUP = 1;

interface LiveGlyph {
  mesh: Mesh;
  longestSide: number;
}

export interface VolumeGlyphs {
  /** Hangs the style's glyph at the origin of `parent`; a style without a glyph is left alone. */
  attach(style: VolumeStyle, parent: Mesh, longestSide: number): void;
  /** Forgets the glyphs of the volumes that were disposed. */
  forgetAll(): void;
  /** The theme changed: glyphs take its fill and halo. */
  setColours(colours: GlyphColours): void;
}

function rescale(scene: Scene, live: readonly LiveGlyph[]): void {
  for (const { mesh, longestSide } of live) {
    const visibleHeight = visibleHeightAt(scene, mesh.getAbsolutePosition());
    mesh.scaling.setAll(glyphSize(visibleHeight, longestSide));
  }
}

function disposeMaterials(materials: Map<VolumeStyle, StandardMaterial>): void {
  for (const material of materials.values()) {
    material.emissiveTexture?.dispose();
    material.dispose();
  }
  materials.clear();
}

function createPlane(scene: Scene, style: VolumeStyle, material: StandardMaterial, parent: Mesh) {
  const mesh = CreatePlane(`volume-glyph-${style}`, { size: 1 }, scene);
  mesh.material = material;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.renderingGroupId = OVERLAY_GROUP;
  mesh.isPickable = false;
  mesh.parent = parent;
  return mesh;
}

export function createVolumeGlyphs(scene: Scene, initial: GlyphColours): VolumeGlyphs {
  let colours = initial;
  const materials = new Map<VolumeStyle, StandardMaterial>();
  let live: LiveGlyph[] = [];
  const materialOf = (style: VolumeStyle, text: string): StandardMaterial => {
    const created =
      materials.get(style) ??
      createLabelMaterial(scene, `volume-glyph-${style}`, text, colours.fill, colours.halo);
    materials.set(style, created);
    return created;
  };
  // Never removed: this factory lives as long as the scene, which disposes its observers.
  scene.onBeforeRenderObservable.add(() => rescale(scene, live));
  return {
    attach: (style, parent, longestSide) => {
      const text = glyphOf(style);
      if (text !== null) {
        live.push({
          mesh: createPlane(scene, style, materialOf(style, text), parent),
          longestSide,
        });
      }
    },
    forgetAll: () => {
      live = [];
    },
    setColours: (next) => {
      colours = next;
      disposeMaterials(materials);
    },
  };
}
