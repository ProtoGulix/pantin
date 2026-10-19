import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Scene } from "@babylonjs/core/scene.js";
import { beforeAll, describe, expect, it } from "vitest";
import { AXIS_COLOURS } from "../theme/data-palette.ts";
import { createAssemblyTrihedron } from "./assembly-trihedron.ts";
import { stubOffscreenCanvas } from "./fake-canvas-test-helpers.ts";

// A theme change repaints the trihedron of the selected assembly (ADR 0057)
// without losing the body it follows.

const TARGET = { assemblyKey: "a", bodyId: "block", bodyPlacement: undefined };
const IDENTITY = { translation: [1, 2, 3], rotation: [0, 0, 0, 1] } as const;

function emissiveHex(scene: Scene, axis: string): string {
  // getMaterialByName returns the base Material; the trihedron's are StandardMaterial.
  const material = scene.getMaterialByName(`trihedron-material-${axis}`) as StandardMaterial | null;
  return material?.emissiveColor.toHexString().toLowerCase() ?? "missing";
}

beforeAll(stubOffscreenCanvas);

describe("the assembly trihedron", () => {
  it("takes the new axis colours and keeps following its target", () => {
    const scene = new Scene(new NullEngine());
    const trihedron = createAssemblyTrihedron(scene, AXIS_COLOURS.dark);
    trihedron.show(TARGET);
    expect(emissiveHex(scene, "X")).toBe(AXIS_COLOURS.dark.x);
    trihedron.setAxisColours(AXIS_COLOURS.light);
    expect(emissiveHex(scene, "X")).toBe(AXIS_COLOURS.light.x);
    expect(emissiveHex(scene, "Z")).toBe(AXIS_COLOURS.light.z);
    expect(scene.materials.filter((m) => m.name === "trihedron-material-X")).toHaveLength(1);
    trihedron.followPose("block", [...IDENTITY.translation], [...IDENTITY.rotation]);
    const root = scene.getTransformNodeByName("assembly-trihedron");
    expect(root?.isEnabled()).toBe(true);
    expect(root?.position.x).toBeCloseTo(1);
    scene.dispose();
  });

  it("stays absent when nothing is shown", () => {
    const scene = new Scene(new NullEngine());
    const trihedron = createAssemblyTrihedron(scene, AXIS_COLOURS.dark);
    trihedron.setAxisColours(AXIS_COLOURS.light);
    expect(scene.getTransformNodeByName("assembly-trihedron")).toBeNull();
    scene.dispose();
  });
});
