// The only module of the core allowed to import Rapier (ADR 0043 point 9,
// enforced by dependency-cruiser).
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import type {
  BeltShape,
  BeltState,
  GuideShape,
  GuideState,
  PhysicsSnapshot,
  PhysicsWorld,
  PhysicsWorldFactory,
  ProductPose,
  Ray,
  SpawnRequest,
  SpawnResult,
  StepInput,
  StepOutput,
} from "../domain/physics-world.ts";
import { apply, normalize, type RigidTransform, type Vector3 } from "../domain/rigid-transform.ts";
import { BELT_THICKNESS, beltBodyPose, beltBodyVelocities } from "./belt-motion.ts";

export type RapierModule = typeof RAPIER;
type World = InstanceType<RapierModule["World"]>;

// Z up, in metres per second squared.
export const GRAVITY = { x: 0, y: 0, z: -9.81 } as const;

// One friction coefficient on every collider (ADR 0043 point 9, spike 0002).
const FRICTION = 0.5;

// Collision groups, a value being membership << 16 | filter. Everything
// collides with everything; the groups only let a ray see products alone. A
// group filter keeps this in the engine's broad phase, where a JavaScript
// predicate would be called for every belt and guide the ray crosses.
function groups(membership: number, filter: number): number {
  return ((membership << 16) | filter) >>> 0;
}
const PRODUCT_MEMBERSHIP = 0x0001;
const FIXTURE_MEMBERSHIP = 0x0002;
const EVERYTHING = 0xffff;
const PRODUCT_GROUPS = groups(PRODUCT_MEMBERSHIP, EVERYTHING);
const FIXTURE_GROUPS = groups(FIXTURE_MEMBERSHIP, EVERYTHING);
const PRODUCT_RAY_GROUPS = groups(EVERYTHING, PRODUCT_MEMBERSHIP);

// Loads and initialises the WASM build (about 73 ms, spike 0002). The module is
// returned, not cached: the caller (main.ts, later) owns it and passes it down.
export async function loadRapier(): Promise<RapierModule> {
  await RAPIER.init();
  return RAPIER;
}

// An empty world stepping at the core's fixed step.
export function createWorld(rapier: RapierModule): World {
  const world = new rapier.World(GRAVITY);
  world.timestep = STEP_SECONDS;
  return world;
}

function vector([x, y, z]: Vector3): { x: number; y: number; z: number } {
  return { x, y, z };
}

function rotation([x, y, z, w]: RigidTransform["rotation"]): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  return { x, y, z, w };
}

// A box of `size` whose bottom face is centred on the frame origin and whose
// axes follow the frame: its centre is half the height up the frame's Z axis.
function boxCentre(frame: RigidTransform, height: number): Vector3 {
  return apply(frame, [0, 0, height / 2]);
}

// `height` is the size along Z of a guide, 0 for a belt.
type Fixture = { handle: number; id: string; height: number };

type WorldState = {
  world: World;
  belts: Fixture[];
  guides: Fixture[];
  // Insertion order is spawn order.
  products: Map<string, number>;
};

function addBelt(rapier: RapierModule, world: World, belt: BeltShape): Fixture {
  // The top face is the belt rectangle: the cuboid hangs under the frame origin.
  const centre = beltBodyPose(belt.pose);
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicVelocityBased()
      .setTranslation(...centre.translation)
      .setRotation(rotation(centre.rotation)),
  );
  world.createCollider(
    rapier.ColliderDesc.cuboid(belt.length / 2, belt.width / 2, BELT_THICKNESS / 2)
      .setFriction(FRICTION)
      .setCollisionGroups(FIXTURE_GROUPS),
    body,
  );
  return { handle: body.handle, id: belt.id, height: 0 };
}

function addGuide(rapier: RapierModule, world: World, guide: GuideShape): Fixture {
  const [sizeX, sizeY, sizeZ] = guide.size;
  const centre = boxCentre(guide.pose, sizeZ);
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(...centre)
      .setRotation(rotation(guide.pose.rotation)),
  );
  world.createCollider(
    rapier.ColliderDesc.cuboid(sizeX / 2, sizeY / 2, sizeZ / 2)
      .setFriction(FRICTION)
      .setCollisionGroups(FIXTURE_GROUPS),
    body,
  );
  return { handle: body.handle, id: guide.id, height: sizeZ };
}

function spawn(rapier: RapierModule, state: WorldState, request: SpawnRequest): SpawnResult {
  if (state.products.has(request.productId)) {
    return { productId: request.productId, status: "duplicate_id" };
  }
  const [sizeX, sizeY, sizeZ] = request.size;
  const body = state.world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(...boxCentre(request.pose, sizeZ))
      .setRotation(rotation(request.pose.rotation))
      .setCanSleep(false),
  );
  state.world.createCollider(
    rapier.ColliderDesc.cuboid(sizeX / 2, sizeY / 2, sizeZ / 2)
      .setMass(request.mass)
      .setFriction(FRICTION)
      .setCollisionGroups(PRODUCT_GROUPS),
    body,
  );
  state.products.set(request.productId, body.handle);
  return { productId: request.productId, status: "spawned" };
}

function fixtureStates<T extends { id: string }>(
  fixtures: readonly Fixture[],
  states: readonly T[],
  what: string,
): [Fixture, T][] {
  const byId = new Map(states.map((entry) => [entry.id, entry]));
  return fixtures.map((fixture) => {
    const entry = byId.get(fixture.id);
    if (entry === undefined) {
      throw new Error(`The step gives no state for ${what} "${fixture.id}".`);
    }
    return [fixture, entry];
  });
}

// Method A of spike 0002: the surface moves at its speed during the step, then
// the belt goes back to the frame's pose, so it never leaves its place. The
// belt starts the step where the last step left it and travels to its new frame
// pose at the frame's own velocity added to the surface velocity, so a belt
// carried by a shuttle drags the box it holds instead of sliding under it
// (ADR 0043 point 3). The angular velocity makes the surface turn with its
// frame. A joint that jumps between two steps gives one step of huge velocity.
function placeBelts(state: WorldState, belts: readonly BeltState[]): void {
  for (const [fixture, belt] of fixtureStates(state.belts, belts, "belt")) {
    const body = state.world.getRigidBody(fixture.handle);
    const { x, y, z } = body.translation();
    const q = body.rotation();
    const previous: RigidTransform = { translation: [x, y, z], rotation: [q.x, q.y, q.z, q.w] };
    const { linear, angular } = beltBodyVelocities(previous, belt);
    body.setLinvel(vector(linear), true);
    body.setAngvel(vector(angular), true);
  }
}

function putBeltsBack(state: WorldState, belts: readonly BeltState[]): void {
  for (const [fixture, belt] of fixtureStates(state.belts, belts, "belt")) {
    const body = state.world.getRigidBody(fixture.handle);
    const pose = beltBodyPose(belt.pose);
    body.setTranslation(vector(pose.translation), false);
    body.setRotation(rotation(pose.rotation), false);
  }
}

function moveGuides(state: WorldState, guides: readonly GuideState[]): void {
  for (const [fixture, guide] of fixtureStates(state.guides, guides, "guide")) {
    const body = state.world.getRigidBody(fixture.handle);
    body.setNextKinematicTranslation(vector(boxCentre(guide.pose, fixture.height)));
    body.setNextKinematicRotation(rotation(guide.pose.rotation));
  }
}

function readProducts(state: WorldState): ProductPose[] {
  return [...state.products].map(([productId, handle]) => {
    const body = state.world.getRigidBody(handle);
    const { x, y, z } = body.translation();
    const q = body.rotation();
    return { productId, pose: { translation: [x, y, z], rotation: [q.x, q.y, q.z, q.w] } };
  });
}

function castRay(rapier: RapierModule, state: WorldState, ray: Ray): number | null {
  const direction = normalize(ray.direction);
  const hit = state.world.castRay(
    new rapier.Ray(vector(ray.origin), vector(direction)),
    ray.maxDistance,
    true,
    undefined,
    PRODUCT_RAY_GROUPS,
  );
  return hit === null ? null : hit.timeOfImpact;
}

// Spawns first, then the belts and guides take their poses, then the engine
// steps and the belts go back to their frames.
function stepState(rapier: RapierModule, state: WorldState, input: StepInput): StepOutput {
  const spawns = input.spawns.map((request) => spawn(rapier, state, request));
  placeBelts(state, input.belts);
  moveGuides(state, input.guides);
  state.world.step();
  putBeltsBack(state, input.belts);
  return { products: readProducts(state), spawns };
}

function removeProducts(state: WorldState, productIds: readonly string[]): void {
  for (const productId of productIds) {
    const handle = state.products.get(productId);
    if (handle !== undefined) {
      state.world.removeRigidBody(state.world.getRigidBody(handle));
      state.products.delete(productId);
    }
  }
}

/** Builds a world holding the belts and guides, with no product. */
export function createRapierPhysicsWorld(
  rapier: RapierModule,
  belts: readonly BeltShape[],
  guides: readonly GuideShape[],
): PhysicsWorld {
  const world = createWorld(rapier);
  const state: WorldState = {
    world,
    belts: belts.map((belt) => addBelt(rapier, world, belt)),
    guides: guides.map((guide) => addGuide(rapier, world, guide)),
    products: new Map(),
  };
  return {
    step: (input) => stepState(rapier, state, input),
    remove: (productIds) => removeProducts(state, productIds),
    castRays: (rays) => rays.map((ray) => castRay(rapier, state, ray)),
    snapshot(): PhysicsSnapshot {
      return { world: state.world.takeSnapshot(), bodies: [...state.products] };
    },
    restore(snapshot) {
      // The restored world is a new object: look every body up again by its
      // handle, never through a stored object (spike 0002). Restore first, free
      // the old world after: if deserialising throws, the state still holds a
      // live world (ADR 0043 point 10 restores after a failed step).
      const restored = rapier.World.restoreSnapshot(snapshot.world);
      state.world.free();
      state.world = restored;
      state.products = new Map(snapshot.bodies);
    },
    dispose() {
      state.world.free();
    },
  };
}

export function createPhysicsWorldFactory(rapier: RapierModule): PhysicsWorldFactory {
  return (belts, guides) => createRapierPhysicsWorld(rapier, belts, guides);
}
