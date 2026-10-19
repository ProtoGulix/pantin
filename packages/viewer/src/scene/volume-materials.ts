import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { VolumeStyle } from "../conveyors/conveyor-drawing.ts";
import { ARROW_COLOR, type VolumeLook } from "../conveyors/volume-appearance.ts";

// The materials of belts, guides, emitters, absorbers and receivers. A guide and
// a belt are lit solids; the others glow faintly, whatever the light.

// Every style, listed once so that loops need no cast.
const VOLUME_STYLES: readonly VolumeStyle[] = ["belt", "guide", "emitter", "absorber", "receiver"];

export type VolumeLooks = Readonly<Record<VolumeStyle, VolumeLook>>;
type VolumeMaterial = PBRMaterial | StandardMaterial;

export interface VolumeMaterials {
  volumes: Readonly<Record<VolumeStyle, VolumeMaterial>>;
  arrow: StandardMaterial;
  /** The theme changed: every material takes its colour again. */
  setLooks(looks: VolumeLooks): void;
}

function solidMaterial(scene: Scene, style: VolumeStyle): PBRMaterial {
  const material = new PBRMaterial(`conveyor-${style}`, scene);
  material.metallic = 0;
  material.roughness = 0.8;
  return material;
}

function glowMaterial(scene: Scene, style: VolumeStyle): StandardMaterial {
  const material = new StandardMaterial(`conveyor-${style}`, scene);
  material.disableLighting = true;
  return material;
}

function paint(material: VolumeMaterial, look: VolumeLook): void {
  const color = Color3.FromHexString(look.color);
  if (material instanceof PBRMaterial) {
    material.albedoColor = color;
  } else {
    material.emissiveColor = color;
  }
  material.alpha = look.alpha;
}

function materialFor(scene: Scene, style: VolumeStyle): VolumeMaterial {
  return style === "belt" || style === "guide"
    ? solidMaterial(scene, style)
    : glowMaterial(scene, style);
}

export function createVolumeMaterials(scene: Scene, initial: VolumeLooks): VolumeMaterials {
  const arrow = new StandardMaterial("conveyor-arrow", scene);
  arrow.disableLighting = true;
  arrow.emissiveColor = Color3.FromHexString(ARROW_COLOR);
  const volumes: Record<VolumeStyle, VolumeMaterial> = {
    belt: materialFor(scene, "belt"),
    guide: materialFor(scene, "guide"),
    emitter: materialFor(scene, "emitter"),
    absorber: materialFor(scene, "absorber"),
    receiver: materialFor(scene, "receiver"),
  };
  const setLooks = (looks: VolumeLooks) => {
    for (const style of VOLUME_STYLES) {
      paint(volumes[style], looks[style]);
    }
  };
  setLooks(initial);
  return { volumes, arrow, setLooks };
}
