import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vector3Tuple } from "../frames.ts";
import type { LoadedBody } from "./body-loader.ts";

export interface BodyBounds {
  // Babylon frame, so index 1 is the core z. Infinite when no body is included.
  minimum: Vector3Tuple;
  maximum: Vector3Tuple;
}

/** Axis-aligned box around the loaded bodies that `included` keeps. */
export function boundsOfBodies(
  loadedBodies: ReadonlyMap<string, LoadedBody>,
  included: (bodyId: string) => boolean,
): BodyBounds {
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const [bodyId, loaded] of loadedBodies) {
    if (included(bodyId)) {
      const bounds = loaded.node.getHierarchyBoundingVectors(true);
      minimum.minimizeInPlace(bounds.min);
      maximum.maximizeInPlace(bounds.max);
    }
  }
  return {
    minimum: [minimum.x, minimum.y, minimum.z],
    maximum: [maximum.x, maximum.y, maximum.z],
  };
}
