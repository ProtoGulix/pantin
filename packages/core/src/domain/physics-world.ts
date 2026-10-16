import type { RigidTransform, Vector3 } from "./rigid-transform.ts";

// The physics port (ADR 0043 point 9): plain data in, plain data out, no
// engine type. The domain works out what goes in and reads what comes out;
// core/src/physics/rapier-world.ts is the only adapter. Z is up, SI units.

// A belt as built: the surface is `length` along +X by `width` along Y,
// centred on the frame origin, at the frame's `pose` when the world is built.
export type BeltShape = {
  id: string;
  length: number;
  width: number;
  pose: RigidTransform;
};

// A guide or end stop: `size` centred on the frame's Z axis, bottom face at
// the frame origin.
export type GuideShape = {
  id: string;
  size: Vector3;
  pose: RigidTransform;
};

// Where a belt is this step and how fast its surface moves, in world axes.
export type BeltState = {
  id: string;
  pose: RigidTransform;
  surfaceVelocity: Vector3;
};

export type GuideState = { id: string; pose: RigidTransform };

// One box to put at rest. `pose` is the emitter frame in the world: the box
// has its bottom face centred on the frame origin and its axes along the frame.
export type SpawnRequest = {
  productId: string;
  pose: RigidTransform;
  size: Vector3;
  mass: number;
};

export type StepInput = {
  belts: readonly BeltState[];
  guides: readonly GuideState[];
  spawns: readonly SpawnRequest[];
};

export type SpawnResult = {
  productId: string;
  // "duplicate_id": a product with that id is already in the world, nothing was added.
  status: "spawned" | "duplicate_id";
};

// `pose` is the pose of the box centre in the world.
export type ProductPose = { productId: string; pose: RigidTransform };

export type StepOutput = {
  // Every product in the world, in spawn order.
  products: readonly ProductPose[];
  // One result per spawn request, in request order.
  spawns: readonly SpawnResult[];
};

export type Ray = { origin: Vector3; direction: Vector3; maxDistance: number };

// What `snapshot()` returns and `restore()` takes back. Plain data, opaque to
// the domain: only the adapter that made it can read it.
export type PhysicsSnapshot = {
  readonly world: Uint8Array;
  readonly bodies: readonly (readonly [string, number])[];
};

export type PhysicsWorld = {
  step(input: StepInput): StepOutput;
  // Ids that are not in the world are ignored.
  remove(productIds: readonly string[]): void;
  // One entry per ray, in order: the distance to the first product hit, or
  // null. Belts and guides are never hit. A ray starting inside a product
  // hits at distance 0.
  castRays(rays: readonly Ray[]): (number | null)[];
  snapshot(): PhysicsSnapshot;
  // Puts the world back as it was when `snapshot` was taken. Products added
  // since are gone.
  restore(snapshot: PhysicsSnapshot): void;
  // Frees the engine memory; the world is unusable afterwards.
  dispose(): void;
};

// The service receives this and builds a world per opened Pantin.
export type PhysicsWorldFactory = (
  belts: readonly BeltShape[],
  guides: readonly GuideShape[],
) => PhysicsWorld;
