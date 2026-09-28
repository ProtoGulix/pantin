import type { Body } from "@pantin/protocol";
import type { Vector3Tuple } from "../frames.ts";

// Pure decisions for the Babylon scene: what to (re)load, how to frame the
// camera, how dense the ground grid is. Kept apart from Babylon so that they
// run under Node in unit tests.

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

/** A 1-2-5 grid step giving about ten cells across the given extent (metres). */
export function chooseGridStep(extentMetres: number): number {
  const rough = Math.max(extentMetres, 1e-3) / 10;
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  const factor = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return factor * power;
}
