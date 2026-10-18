import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { beamLookFor } from "../conveyors/beam-appearance.ts";
import type { SignalColours } from "../theme/signal-look.ts";

// The two looks of a light beam. Thickness is not a material property: a beam
// takes its look's thickness scale on the radial axes of its cylinder.

export interface BeamMaterials {
  /** The beam takes the look of its state: material and thickness. */
  paint(beam: Mesh, on: boolean): void;
  setColours(colours: SignalColours): void;
}

function beamMaterial(scene: Scene, on: boolean, colours: SignalColours): StandardMaterial {
  const material = new StandardMaterial(on ? "conveyor-beam-on" : "conveyor-beam-off", scene);
  material.disableLighting = true;
  applyLook(material, on, colours);
  return material;
}

function applyLook(material: StandardMaterial, on: boolean, colours: SignalColours): void {
  const look = beamLookFor(on, colours);
  material.emissiveColor = Color3.FromHexString(look.color);
  material.alpha = look.alpha;
}

export function createBeamMaterials(scene: Scene, initial: SignalColours): BeamMaterials {
  const materials = {
    on: beamMaterial(scene, true, initial),
    off: beamMaterial(scene, false, initial),
  };
  let colours = initial;
  return {
    paint: (beam, on) => {
      beam.material = on ? materials.on : materials.off;
      const { thicknessScale } = beamLookFor(on, colours);
      beam.scaling.x = thicknessScale;
      beam.scaling.z = thicknessScale;
    },
    setColours: (next) => {
      colours = next;
      applyLook(materials.on, true, colours);
      applyLook(materials.off, false, colours);
    },
  };
}
