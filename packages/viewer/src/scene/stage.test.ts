import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Scene } from "@babylonjs/core/scene.js";
import { beforeAll, describe, expect, it } from "vitest";
import { SCENE_PALETTES } from "../theme/scene-palette.ts";
import { stubOffscreenCanvas } from "./fake-canvas-test-helpers.ts";
import { createStage } from "./stage.ts";

// The world axes of the stage carry the theme's axis colours and a letter at
// each tip, so that red and green are never told apart by colour alone (ADR 0057).

function labelTextureName(scene: Scene, letter: string): string {
  // getMaterialByName returns the base Material; the label's is a StandardMaterial.
  const material = scene.getMaterialByName(`core-axis-label-${letter}-material`) as
    | (StandardMaterial & { emissiveTexture: { name: string } | null })
    | null;
  return material?.emissiveTexture?.name ?? "missing";
}

beforeAll(stubOffscreenCanvas);

describe("the stage axes", () => {
  it("draws a line and a letter for each of X, Y and Z", () => {
    const scene = new Scene(new NullEngine());
    createStage(scene, SCENE_PALETTES.dark);
    for (const letter of ["X", "Y", "Z"]) {
      expect(scene.getMeshByName(`core-axis-${letter}`)).not.toBeNull();
      const label = scene.getMeshByName(`core-axis-label-${letter}`);
      expect(label?.isPickable).toBe(false);
      expect(labelTextureName(scene, letter)).not.toBe("missing");
    }
    scene.dispose();
  });

  it("rebuilds the axes with the colours of the new theme, without leaving old ones", () => {
    const scene = new Scene(new NullEngine());
    const stage = createStage(scene, SCENE_PALETTES.dark);
    const darkLine = scene.getMeshByName("core-axis-X");
    const darkColours = darkLine?.getVerticesData("color")?.slice(0, 4);
    stage.setPalette(SCENE_PALETTES.light);
    const lightColours = scene.getMeshByName("core-axis-X")?.getVerticesData("color")?.slice(0, 4);
    expect(darkColours).toBeDefined();
    expect(lightColours).not.toEqual(darkColours);
    expect(scene.meshes.filter((mesh) => mesh.name === "core-axis-X")).toHaveLength(1);
    expect(scene.meshes.filter((mesh) => mesh.name === "core-axis-label-X")).toHaveLength(1);
    scene.dispose();
  });
});
