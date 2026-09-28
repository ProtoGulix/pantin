import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { coreToBabylonPosition, type Vector3Tuple } from "../frames.ts";
import { chooseGridStep } from "./scene-plan.ts";

// The fixed decor of the viewport: background, lights, ground, grid and the
// world axes. Grid and axes are built from core coordinates and converted, so
// they show the core frame (Z up) whatever Babylon uses internally.

const BACKGROUND = Color4.FromHexString("#1b1e24ff");
const GROUND_COLOR = Color3.FromHexString("#2a2e36");
const GRID_MINOR_COLOR = Color4.FromHexString("#3a404bff");
const GRID_MAJOR_COLOR = Color4.FromHexString("#4f5766ff");
const AXIS_X_COLOR = Color4.FromHexString("#e5534bff");
const AXIS_Y_COLOR = Color4.FromHexString("#57ab5aff");
const AXIS_Z_COLOR = Color4.FromHexString("#539bf5ff");

export interface Stage {
  shadowGenerator: ShadowGenerator;
  /** Resizes ground, grid and axes around the bodies (sizes in metres). */
  fitToBodies(centre: Vector3Tuple, extentMetres: number): void;
}

function setUpLighting(scene: Scene): ShadowGenerator {
  scene.clearColor = BACKGROUND;
  // Neutral tone mapping keeps CAD colours close to their authored values.
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;

  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.7;
  sky.diffuse = Color3.FromHexString("#dfe6f2");
  sky.groundColor = Color3.FromHexString("#3a3530");

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.35), scene);
  sun.intensity = 2.2;
  sun.autoCalcShadowZBounds = true;

  const shadowGenerator = new ShadowGenerator(2048, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.bias = 0.0005;
  shadowGenerator.normalBias = 0.01;
  return shadowGenerator;
}

function toBabylon(point: Vector3Tuple): Vector3 {
  return Vector3.FromArray(coreToBabylonPosition(point));
}

// Lines of the core XY plane (z = 0), a major line every five cells.
function gridLines(centre: Vector3Tuple, halfSize: number, step: number) {
  const minor: Vector3[][] = [];
  const major: Vector3[][] = [];
  const cellCount = Math.ceil(halfSize / step);
  const originX = Math.round(centre[0] / step) * step;
  const originY = Math.round(centre[1] / step) * step;
  for (let index = -cellCount; index <= cellCount; index += 1) {
    const target = index % 5 === 0 ? major : minor;
    const offset = index * step;
    const span = cellCount * step;
    target.push([
      toBabylon([originX + offset, originY - span, 0]),
      toBabylon([originX + offset, originY + span, 0]),
    ]);
    target.push([
      toBabylon([originX - span, originY + offset, 0]),
      toBabylon([originX + span, originY + offset, 0]),
    ]);
  }
  return { minor, major };
}

// Every line gets the same colour at both ends.
function uniformLines(scene: Scene, name: string, lines: Vector3[][], color: Color4): Mesh {
  const mesh = CreateLineSystem(name, { lines, colors: lines.map(() => [color, color]) }, scene);
  mesh.isPickable = false;
  return mesh;
}

function createGroundMesh(scene: Scene, centre: Vector3Tuple, halfSize: number): Mesh {
  const ground = CreateGround("ground", { width: halfSize * 4, height: halfSize * 4 }, scene);
  ground.position = toBabylon([centre[0], centre[1], 0]);
  ground.isPickable = false;
  ground.receiveShadows = true;
  const material = new PBRMaterial("ground-material", scene);
  material.albedoColor = GROUND_COLOR;
  material.metallic = 0;
  material.roughness = 1;
  // Pushed back in depth so the grid lines drawn at z = 0 never flicker.
  material.zOffset = 2;
  ground.material = material;
  return ground;
}

// Core X, Y and Z from the world origin, in red, green and blue.
function createCoreAxes(scene: Scene, length: number): Mesh[] {
  const axes: readonly { end: Vector3Tuple; color: Color4 }[] = [
    { end: [length, 0, 0], color: AXIS_X_COLOR },
    { end: [0, length, 0], color: AXIS_Y_COLOR },
    { end: [0, 0, length], color: AXIS_Z_COLOR },
  ];
  return axes.map(({ end, color }, index) =>
    uniformLines(scene, `core-axis-${index}`, [[toBabylon([0, 0, 0]), toBabylon(end)]], color),
  );
}

function buildDecor(scene: Scene, centre: Vector3Tuple, extentMetres: number): Mesh[] {
  const halfSize = Math.max(extentMetres * 1.5, 0.5);
  const step = chooseGridStep(halfSize * 2);
  const { minor, major } = gridLines(centre, halfSize, step);
  return [
    createGroundMesh(scene, centre, halfSize),
    uniformLines(scene, "grid-minor", minor, GRID_MINOR_COLOR),
    uniformLines(scene, "grid-major", major, GRID_MAJOR_COLOR),
    ...createCoreAxes(scene, step * 3),
  ];
}

export function createStage(scene: Scene): Stage {
  const shadowGenerator = setUpLighting(scene);
  let decor = buildDecor(scene, [0, 0, 0], 1);
  return {
    shadowGenerator,
    fitToBodies: (centre, extentMetres) => {
      for (const mesh of decor) {
        mesh.dispose(false, true);
      }
      decor = buildDecor(scene, centre, extentMetres);
    },
  };
}
