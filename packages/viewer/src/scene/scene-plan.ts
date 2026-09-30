import type { Body } from "@pantin/protocol";
import { coreToBabylonPosition, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import type { JointPreview } from "../joints/joint-preview.ts";

// Pure decisions for the Babylon scene: what to (re)load, how to frame the
// camera, where the floor stands and how dense its grid is, which bodies are tinted and where the
// joint arrow stands. Kept apart from Babylon so that they run under Node in
// unit tests.

export interface SceneSyncPlan {
  bodiesToLoad: Body[];
  bodyIdsToRemove: string[];
}

// Everything that changes what a body looks like. A rename does not: the
// display name is not part of the key, so renaming never reloads a mesh.
export function bodyRenderKey(pantinId: string, body: Body): string {
  const { format, unit, upAxis } = body.source;
  return [pantinId, body.id, body.mesh, format, unit, upAxis].join("|");
}

export function planSceneSync(
  loadedKeysByBodyId: ReadonlyMap<string, string>,
  pantinId: string | null,
  bodies: readonly Body[],
): SceneSyncPlan {
  const wantedKeys = new Map(
    pantinId === null ? [] : bodies.map((body) => [body.id, bodyRenderKey(pantinId, body)]),
  );
  const bodyIdsToRemove = [...loadedKeysByBodyId]
    .filter(([bodyId, key]) => wantedKeys.get(bodyId) !== key)
    .map(([bodyId]) => bodyId);
  const bodiesToLoad =
    pantinId === null
      ? []
      : bodies.filter((body) => loadedKeysByBodyId.get(body.id) !== wantedKeys.get(body.id));
  return { bodiesToLoad, bodyIdsToRemove };
}

export interface CameraFraming {
  target: Vector3Tuple;
  radius: number;
}

const EMPTY_SCENE_FRAMING: CameraFraming = { target: [0, 0, 0], radius: 3 };

// Margin so that the framed bodies do not touch the viewport edges.
const FRAMING_MARGIN = 1.2;

/** Camera distance that fits the bounding sphere of the box in the field of view. */
export function frameBounds(
  minimum: Vector3Tuple,
  maximum: Vector3Tuple,
  fieldOfViewRadians: number,
): CameraFraming {
  const size: Vector3Tuple = [
    maximum[0] - minimum[0],
    maximum[1] - minimum[1],
    maximum[2] - minimum[2],
  ];
  if (!size.every((value) => Number.isFinite(value) && value >= 0)) {
    return EMPTY_SCENE_FRAMING;
  }
  const sphereRadius = Math.max(Math.hypot(...size) / 2, 1e-3);
  return {
    target: [
      (minimum[0] + maximum[0]) / 2,
      (minimum[1] + maximum[1]) / 2,
      (minimum[2] + maximum[2]) / 2,
    ],
    radius: (FRAMING_MARGIN * sphereRadius) / Math.sin(fieldOfViewRadians / 2),
  };
}

/**
 * Height of the floor in the core frame: z = 0, unless bodies go below it
 * (a part modelled around its centre, for instance); the floor then drops to
 * their lowest point so that they rest on it instead of crossing it.
 */
export function floorHeight(lowestCoreZ: number): number {
  return Number.isFinite(lowestCoreZ) ? Math.min(0, lowestCoreZ) : 0;
}

/** A 1-2-5 grid step giving about ten cells across the given extent (metres). */
export function chooseGridStep(extentMetres: number): number {
  const rough = Math.max(extentMetres, 1e-3) / 10;
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  const factor = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return factor * power;
}

export interface ArrowPlacement {
  // Babylon frame: where the arrow starts, and the rotation taking Babylon's
  // +Y (the axis of its cylinders) onto the joint's positive direction.
  start: Vector3Tuple;
  rotation: QuaternionTuple;
  // Metres, from the tip to the start.
  length: number;
}

// Shortest rotation from +Y to a unit vector: axis Y x d, half angle folded
// into w = 1 + Y.d, then normalised. Opposite vectors have no shortest axis:
// half a turn about X is one of them.
export function rotationFromUpTo([x, y, z]: Vector3Tuple): QuaternionTuple {
  if (y < -1 + 1e-9) {
    return [1, 0, 0, 0];
  }
  const norm = Math.hypot(z, -x, 1 + y);
  return [z / norm, 0, -x / norm, (1 + y) / norm];
}

/**
 * The arrow of a joint, from its origin along its axis (core frame, the axis
 * need not be unit). Its length follows the child body's size, so that it
 * reads at any scale without hiding a small part.
 */
export function placeJointArrow(
  origin: Vector3Tuple,
  axis: Vector3Tuple,
  childExtentMetres: number,
): ArrowPlacement {
  const [x, y, z] = coreToBabylonPosition(axis);
  const norm = Math.hypot(x, y, z);
  return {
    start: coreToBabylonPosition(origin),
    rotation: rotationFromUpTo([x / norm, y / norm, z / norm]),
    length: Math.max(childExtentMetres * 0.75, 0.02),
  };
}

export type BodyHighlight = "selected" | "parent" | "child";

/**
 * A previewed joint replaces the selection: its bodies are what matters then.
 * When a joint links a body to itself, the child wins.
 */
export function bodyHighlight(
  bodyId: string,
  selectedBodyIds: ReadonlySet<string>,
  preview: JointPreview | null,
): BodyHighlight | null {
  if (preview === null) {
    return selectedBodyIds.has(bodyId) ? "selected" : null;
  }
  if (bodyId === preview.childBodyId) {
    return "child";
  }
  return bodyId === preview.parentBodyId ? "parent" : null;
}
