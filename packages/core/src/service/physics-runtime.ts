import type { ConsoleEvent, PantinDocument } from "@pantin/protocol";
import type { ConsoleBuffer } from "../domain/console-buffer.ts";
import { physicsRebuiltEvent } from "../domain/console-events.ts";
import { frameResolver, physicsDefinitionKey } from "../domain/physics-frames.ts";
import { clearedPhysicsState, type PhysicsState } from "../domain/physics-state.ts";
import {
  beltShapes,
  finishPhysicsStep,
  guideShapes,
  planPhysicsStep,
  removalsOf,
} from "../domain/physics-step-plan.ts";
import type {
  PhysicsSnapshot,
  PhysicsWorld,
  PhysicsWorldFactory,
} from "../domain/physics-world.ts";
import { recordConsoleEvents } from "./console-record.ts";

// The physics world of an open Pantin and its lifecycle (ADR 0043 points 9 to
// 11): the service boundary, where the pure domain meets the engine. Structural
// types, so that open-pantins.ts can use it without a cycle.

// Injected at start-up, as the step converter is: the real factory comes from
// main.ts, tests bring their own.
export type PhysicsSettings = {
  createWorld: PhysicsWorldFactory;
  productLimit: number;
};

export type PhysicsRuntime = {
  world: PhysicsWorld;
  // The world as built, with no product: what reset and a failed step go back to.
  emptySnapshot: PhysicsSnapshot;
  // physicsDefinitionKey of the document the world was built from.
  definitionKey: string;
  // The last document checked against the key. Documents are immutable values,
  // replaced at each edit, so the same object needs no new check.
  checkedDocument: PantinDocument;
};

export type PhysicsHost = {
  document: PantinDocument;
  jointPositions: ReadonlyMap<string, number>;
  physics: PhysicsRuntime;
  physicsState: PhysicsState;
  console: ConsoleBuffer;
  stepCount: number;
};

/**
 * A world holding the document's belts and guides at their reference poses (no
 * joint moved), so that a fresh Pantin, a rebuilt one and a reset one start
 * from the same snapshot.
 */
export function buildPhysicsRuntime(
  createWorld: PhysicsWorldFactory,
  document: PantinDocument,
): PhysicsRuntime {
  const resolve = frameResolver(document, new Map());
  const world = createWorld(beltShapes(document, resolve), guideShapes(document, resolve));
  try {
    return {
      world,
      emptySnapshot: world.snapshot(),
      definitionKey: physicsDefinitionKey(document),
      checkedDocument: document,
    };
  } catch (error) {
    world.dispose();
    throw error;
  }
}

function rebuild(settings: PhysicsSettings, host: PhysicsHost, document: PantinDocument): void {
  const next = buildPhysicsRuntime(settings.createWorld, document);
  host.physics.world.dispose();
  host.physics = next;
  host.physicsState = clearedPhysicsState(host.physicsState, false);
}

// True when the world still matches `document`; remembers the check.
function matches(host: PhysicsHost, document: PantinDocument): boolean {
  const { physics } = host;
  if (document === physics.checkedDocument) {
    return true;
  }
  if (physicsDefinitionKey(document) !== physics.definitionKey) {
    return false;
  }
  physics.checkedDocument = document;
  return true;
}

// Run before each step, and by edits before they store their document: a change
// of the belts, guides or their frames rebuilds the world and clears the
// products (ADR 0043 point 11). The console says so only when there were
// products: editing a belt on an empty line loses nothing, and a note at each
// design-time edit would be noise. Called with the new document before it is
// stored, a failing rebuild leaves the edit unapplied.
export function syncPhysicsTo(
  context: { physics: PhysicsSettings; wallClock: () => Date },
  host: PhysicsHost,
  document: PantinDocument,
): void {
  if (matches(host, document)) {
    return;
  }
  const cleared = host.physicsState.products.length;
  rebuild(context.physics, host, document);
  if (cleared > 0) {
    recordConsoleEvents(context, host, [physicsRebuiltEvent(cleared)]);
  }
}

// Every edit path assigns the open document on its own, so the step checks it.
export function syncPhysics(
  context: { physics: PhysicsSettings; wallClock: () => Date },
  host: PhysicsHost,
): void {
  syncPhysicsTo(context, host, host.document);
}

/** Runtime reset (ADR 0043 point 11): no product, no latched spawn, numbering from p1. */
export function resetPhysics(settings: PhysicsSettings, host: PhysicsHost): void {
  // A discard may have brought back a document with other belts or guides.
  if (matches(host, host.document)) {
    host.physics.world.restore(host.physics.emptySnapshot);
  } else {
    rebuild(settings, host, host.document);
  }
  host.physicsState = clearedPhysicsState(host.physicsState, true);
}

/**
 * The physics part of a simulation step (ADR 0043 point 10), from the joint
 * state the drives and actuators just produced. Everything pure is worked out
 * before the world is touched; nothing is stored here: the caller stores the
 * returned state once the whole step succeeded. If the world throws, it goes
 * back to its empty snapshot with no product, and the error goes on: the step
 * is not applied (ADR 0031 point 3).
 */
export function stepPhysics(
  settings: PhysicsSettings,
  host: PhysicsHost,
  jointPositions: ReadonlyMap<string, number>,
  jointVelocities: ReadonlyMap<string, number>,
): { state: PhysicsState; events: readonly ConsoleEvent[] } {
  const plan = planPhysicsStep(
    host.document,
    jointPositions,
    jointVelocities,
    host.physicsState,
    settings.productLimit,
  );
  const { world, emptySnapshot } = host.physics;
  try {
    const output = world.step(plan.input);
    const removed = removalsOf(plan, output);
    world.remove(removed);
    // P2 (ADR 0043 point 10): ray casts of the presence sensors and their
    // evaluation go here, on the poses the world answered, after the removals.
    return {
      state: finishPhysicsStep(host.physicsState, plan, output.products, removed),
      events: plan.events,
    };
  } catch (error) {
    world.restore(emptySnapshot);
    host.physicsState = clearedPhysicsState(host.physicsState, false);
    throw error;
  }
}

export function disposePhysics(host: Pick<PhysicsHost, "physics">): void {
  host.physics.world.dispose();
}
