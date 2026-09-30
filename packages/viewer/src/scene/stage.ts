import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { BackgroundMaterial } from "@babylonjs/core/Materials/Background/backgroundMaterial.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
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
//
// The look is a product studio: a dark seamless background, soft light from
// above, and a ground that shows nothing but the soft shadow of the bodies,
// so they seem to rest on an endless floor.

// Same value as --viewport-background in base.css, shown before the first frame.
const BACKGROUND = Color4.FromHexString("#1b1e24ff");
const GRID_MINOR_COLOR = Color4.FromHexString("#3a404bff");
const GRID_MAJOR_COLOR = Color4.FromHexString("#4f5766ff");
const AXIS_X_COLOR = Color4.FromHexString("#e5534bff");
const AXIS_Y_COLOR = Color4.FromHexString("#57ab5aff");
const AXIS_Z_COLOR = Color4.FromHexString("#539bf5ff");

export interface Stage {
  shadowGenerator: ShadowGenerator;
  /** Resizes ground, grid and axes around the bodies; the floor stands at core z = floorZ (metres). */
  fitToBodies(centre: Vector3Tuple, extentMetres: number, floorZ: number): void;
}

function setUpLighting(scene: Scene): ShadowGenerator {
  scene.clearColor = BACKGROUND;
  // Neutral tone mapping keeps CAD colours close to their authored values.
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;

  // A white sky and a light floor bounce: shaded sides stay light grey, never black.
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.8;
  sky.diffuse = Color3.White();
  sky.groundColor = Color3.FromHexString("#8c8c8c");

  // Nearly overhead, so the shadow sits under the bodies like on a studio floor.
  const sun = new DirectionalLight("sun", new Vector3(-0.15, -1, 0.1), scene);
  sun.intensity = 1.9;
  sun.autoCalcShadowZBounds = true;

  // From the other side, without shadow, to separate the faces the sun leaves flat.
  const fill = new DirectionalLight("fill", new Vector3(0.6, -0.4, -0.7), scene);
  fill.intensity = 0.45;

  const shadowGenerator = new ShadowGenerator(2048, sun);
  // A blurred shadow on the floor only: cheap and available on WebGL 1 and 2,
  // unlike contact hardening shadows, whose heavy shader can make a modest
  // GPU reset and the browser then refuse WebGL for the whole session.
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.useKernelBlur = true;
  shadowGenerator.blurKernel = 64;
  // Lower than the default 50: the shadow edge fades over a longer distance.
  shadowGenerator.depthScale = 10;
  return shadowGenerator;
}

function toBabylon(point: Vector3Tuple): Vector3 {
  return Vector3.FromArray(coreToBabylonPosition(point));
}

// Lines of the floor plane, a major line every five cells.
function gridLines(centre: Vector3Tuple, halfSize: number, step: number, floorZ: number) {
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
      toBabylon([originX + offset, originY - span, floorZ]),
      toBabylon([originX + offset, originY + span, floorZ]),
    ]);
    target.push([
      toBabylon([originX - span, originY + offset, floorZ]),
      toBabylon([originX + span, originY + offset, floorZ]),
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

// Invisible but for the shadows it receives, so the background shows through.
function createGroundMesh(
  scene: Scene,
  centre: Vector3Tuple,
  halfSize: number,
  floorZ: number,
): Mesh {
  const ground = CreateGround("ground", { width: halfSize * 4, height: halfSize * 4 }, scene);
  ground.position = toBabylon([centre[0], centre[1], floorZ]);
  ground.isPickable = false;
  ground.receiveShadows = true;
  const material = new BackgroundMaterial("ground-material", scene);
  material.shadowOnly = true;
  material.primaryColor = Color3.Black();
  material.alpha = 0.45;
  // Pushed back in depth so the grid lines drawn on it never flicker.
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

function buildDecor(
  scene: Scene,
  centre: Vector3Tuple,
  extentMetres: number,
  floorZ: number,
): Mesh[] {
  const halfSize = Math.max(extentMetres * 1.5, 0.5);
  const step = chooseGridStep(halfSize * 2);
  const { minor, major } = gridLines(centre, halfSize, step, floorZ);
  return [
    createGroundMesh(scene, centre, halfSize, floorZ),
    uniformLines(scene, "grid-minor", minor, GRID_MINOR_COLOR),
    uniformLines(scene, "grid-major", major, GRID_MAJOR_COLOR),
    ...createCoreAxes(scene, step * 3),
  ];
}

export function createStage(scene: Scene): Stage {
  const shadowGenerator = setUpLighting(scene);
  let decor = buildDecor(scene, [0, 0, 0], 1, 0);
  return {
    shadowGenerator,
    fitToBodies: (centre, extentMetres, floorZ) => {
      for (const mesh of decor) {
        mesh.dispose(false, true);
      }
      decor = buildDecor(scene, centre, extentMetres, floorZ);
    },
  };
}
