import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { normalFacingEye } from "../alignment/facing-normal.ts";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import { babylonToCorePosition, type Vector3Tuple } from "../frames.ts";
import { gltfPointersOf } from "./gltf-pointers.ts";
import type { ViewportContext } from "./viewport-context.ts";

// A click while aligning (ADR 0035 point 3): the body, the Babylon mesh and
// triangle picked, and the hit point and triangle normal in the Pantin frame.
// Babylon's world is the Pantin frame with Y and Z swapped, in metres
// (frames.ts), so points and directions convert alike.

function tupleOf(vector: Vector3): Vector3Tuple {
  return [vector.x, vector.y, vector.z];
}

export function viewportPickOf(context: ViewportContext, pick: PickingInfo): ViewportPick | null {
  const mesh = pick.hit ? pick.pickedMesh : null;
  const bodyId = mesh === null ? undefined : context.bodyIdByMesh.get(mesh);
  const point = pick.pickedPoint;
  // The triangle's own normal: a fallback pick is the plane of that triangle.
  const normal = pick.getNormal(true, false);
  if (mesh === null || bodyId === undefined || point === null || normal === null) {
    return null;
  }
  const camera = context.scene.activeCamera ?? context.camera;
  const facing = normalFacingEye(
    tupleOf(normal.normalize()),
    tupleOf(point),
    tupleOf(camera.globalPosition),
  );
  return {
    bodyId,
    meshIndex: context.loadedBodies.get(bodyId)?.meshes.indexOf(mesh) ?? -1,
    pointers: gltfPointersOf(mesh),
    triangle: pick.faceId,
    point: babylonToCorePosition(tupleOf(point)),
    normal: babylonToCorePosition(facing),
  };
}
