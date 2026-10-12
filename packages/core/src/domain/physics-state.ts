import type { ProductMaterial } from "@pantin/protocol";
import type { RigidTransform, Vector3 } from "./rigid-transform.ts";

// The runtime state of the physics of an open Pantin (ADR 0043 point 11), as an
// immutable value: never saved. The world itself is not here, it lives at the
// service boundary (service/physics-runtime.ts).

// A product in the world: what its emitter made it, and where it was after the
// last step. It carries its size, so deleting its emitter leaves it drawable.
export type ProductRecord = {
  id: string;
  emitterId: string;
  size: Vector3;
  mass: number;
  material: ProductMaterial;
  // Pose of the box centre in the world.
  pose: RigidTransform;
};

export type PhysicsState = {
  // In spawn order.
  products: readonly ProductRecord[];
  // The number the next product takes: p1, p2, ...
  nextProductNumber: number;
  // Last value written to each emitter's spawn tag (0 when never written).
  spawnValues: ReadonlyMap<string, number>;
  // Emitter ids of the spawns latched by a write and not served yet, in write order.
  queuedSpawns: readonly string[];
  // Each presence sensor's tag values of the last step.
  presenceOutputs: ReadonlyMap<string, Readonly<Record<string, number>>>;
  // Each presence sensor's evaluation state, kept with the outputs (ADR 0025).
  presenceStates: ReadonlyMap<string, Readonly<Record<string, number>>>;
};

export function emptyPhysicsState(): PhysicsState {
  return {
    products: [],
    nextProductNumber: 1,
    spawnValues: new Map(),
    queuedSpawns: [],
    presenceOutputs: new Map(),
    presenceStates: new Map(),
  };
}

// Reset and failed steps: no product, no pending spawn, numbering from p1. The
// spawn values stay unless `forgetSpawnValues`: after a reset the PLC must be
// able to start from 0 again, so the last written values go too.
export function clearedPhysicsState(state: PhysicsState, forgetSpawnValues: boolean): PhysicsState {
  return {
    ...emptyPhysicsState(),
    spawnValues: forgetSpawnValues ? new Map() : state.spawnValues,
  };
}

// A write of 1 over a last value of 0 (or none) latches one spawn at once, as
// setpoints are queued (ADR 0043 point 5, ADR 0012 point 3); a write of the
// value already held does nothing.
export function writeSpawnValue(
  state: PhysicsState,
  emitterId: string,
  value: number,
): PhysicsState {
  const last = state.spawnValues.get(emitterId) ?? 0;
  if (value === last) {
    return state;
  }
  return {
    ...state,
    spawnValues: new Map(state.spawnValues).set(emitterId, value),
    queuedSpawns: value === 1 ? [...state.queuedSpawns, emitterId] : state.queuedSpawns,
  };
}
