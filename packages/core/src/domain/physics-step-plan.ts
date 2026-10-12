import type { ConsoleEvent, PantinDocument } from "@pantin/protocol";
import { beltSurfaceVelocity } from "./belt-velocity.ts";
import type { OrientedBox } from "./box-overlap.ts";
import { spawnSkippedEvent } from "./console-events.ts";
import { type FrameResolver, frameResolver } from "./physics-frames.ts";
import type { PhysicsState, ProductRecord } from "./physics-state.ts";
import type {
  BeltShape,
  BeltState,
  GuideShape,
  ProductPose,
  SpawnResult,
  StepInput,
  StepOutput,
} from "./physics-world.ts";
import { type PresenceRays, presenceRays } from "./presence-step.ts";
import { type AbsorberVolume, productsToRemove } from "./product-absorption.ts";
import { planSpawns, type QueuedSpawn } from "./spawn-planning.ts";

// The pure parts around one world step (ADR 0043 point 10): `planPhysicsStep`
// works out everything the world needs from the new joint state, and
// `finishPhysicsStep` folds what the world answered into the next state. The
// service runs `world.step` between them.

export type PhysicsStepPlan = {
  input: StepInput;
  absorbers: readonly AbsorberVolume[];
  // Worked out from the new joint poses, cast after the removals.
  presence: PresenceRays;
  // The products this step creates, in spawn order, with their emitter's box.
  spawned: readonly Omit<ProductRecord, "pose">[];
  nextProductNumber: number;
  events: readonly ConsoleEvent[];
};

export function beltShapes(document: PantinDocument, resolve: FrameResolver): BeltShape[] {
  return document.belts.map((belt) => ({
    id: belt.id,
    length: belt.length,
    width: belt.width,
    pose: resolve(belt),
  }));
}

export function guideShapes(document: PantinDocument, resolve: FrameResolver): GuideShape[] {
  return document.guides.map((guide) => ({ id: guide.id, size: guide.size, pose: resolve(guide) }));
}

function queuedSpawnsOf(
  document: PantinDocument,
  emitterIds: readonly string[],
  resolve: FrameResolver,
): QueuedSpawn[] {
  // An emitter deleted since its spawn was latched no longer spawns.
  return emitterIds.flatMap((emitterId) => {
    const emitter = document.emitters.find(({ id }) => id === emitterId);
    return emitter === undefined
      ? []
      : [{ emitterId, pose: resolve(emitter), size: emitter.box.size, mass: emitter.box.mass }];
  });
}

function occupiedBoxes(products: readonly ProductRecord[]): OrientedBox[] {
  return products.map(({ pose, size }) => ({
    centre: pose.translation,
    rotation: pose.rotation,
    size,
  }));
}

function beltStates(
  document: PantinDocument,
  jointVelocities: ReadonlyMap<string, number>,
  resolve: FrameResolver,
): BeltState[] {
  return document.belts.map((belt) => {
    const pose = resolve(belt);
    // A drum with no velocity this step (untied, jammed, moved by its setpoint)
    // leaves its belt still.
    const drumVelocity = jointVelocities.get(belt.drumJoint) ?? 0;
    return {
      id: belt.id,
      pose,
      surfaceVelocity: beltSurfaceVelocity(pose, belt.drumRadius, drumVelocity),
    };
  });
}

export function planPhysicsStep(
  document: PantinDocument,
  jointPositions: ReadonlyMap<string, number>,
  jointVelocities: ReadonlyMap<string, number>,
  state: PhysicsState,
  productLimit: number,
): PhysicsStepPlan {
  const resolve = frameResolver(document, jointPositions);
  const spawnPlan = planSpawns(
    queuedSpawnsOf(document, state.queuedSpawns, resolve),
    occupiedBoxes(state.products),
    state.nextProductNumber,
    productLimit,
  );
  const materialOf = new Map(document.emitters.map(({ id, box }) => [id, box.material]));
  return {
    input: {
      belts: beltStates(document, jointVelocities, resolve),
      guides: guideShapes(document, resolve).map(({ id, pose }) => ({ id, pose })),
      spawns: spawnPlan.requests.map(({ productId, pose, size, mass }) => ({
        productId,
        pose,
        size,
        mass,
      })),
    },
    absorbers: document.absorbers.map((absorber) => ({
      id: absorber.id,
      pose: resolve(absorber),
      size: absorber.size,
    })),
    spawned: spawnPlan.requests.map((request) => ({
      id: request.productId,
      emitterId: request.emitterId,
      size: request.size,
      mass: request.mass,
      // A queued spawn only exists for an emitter of the document (queuedSpawnsOf).
      material: materialOf.get(request.emitterId) ?? "cardboard",
    })),
    presence: presenceRays(document, resolve),
    nextProductNumber: spawnPlan.nextProductNumber,
    events: spawnPlan.skipped.map(({ emitterId, reason }) => spawnSkippedEvent(emitterId, reason)),
  };
}

function checkSpawnResults(results: readonly SpawnResult[]): void {
  const duplicate = results.find(({ status }) => status !== "spawned");
  if (duplicate !== undefined) {
    throw new Error(`The world refused product "${duplicate.productId}" (${duplicate.status}).`);
  }
}

// The products the world holds after the step that the absorbers and the kill
// plane destroy, from the poses it answered.
export function removalsOf(plan: PhysicsStepPlan, output: StepOutput): string[] {
  checkSpawnResults(output.spawns);
  return productsToRemove(output.products, plan.absorbers).map(({ productId }) => productId);
}

// `removed` are the ids the service took out of the world after the step.
export function finishPhysicsStep(
  state: PhysicsState,
  plan: PhysicsStepPlan,
  poses: readonly ProductPose[],
  removed: readonly string[],
): PhysicsState {
  const poseOf = new Map(poses.map(({ productId, pose }) => [productId, pose]));
  const gone = new Set(removed);
  const products = [...state.products, ...plan.spawned]
    .filter(({ id }) => !gone.has(id))
    .map((record) => {
      const pose = poseOf.get(record.id);
      if (pose === undefined) {
        throw new Error(`The world gave no pose for product "${record.id}".`);
      }
      return { ...record, pose };
    });
  return { ...state, products, nextProductNumber: plan.nextProductNumber, queuedSpawns: [] };
}
