import type { PhysicsSnapshot, PhysicsWorld, PhysicsWorldFactory } from "./physics-world.ts";

// The world of a core started without a physics engine (tests that do not
// care about products): a Pantin with no emitter never asks anything of it, so
// it steps, snapshots and restores as an empty world. A spawn is the one thing
// it cannot do, and says why.

const EMPTY_SNAPSHOT: PhysicsSnapshot = { world: new Uint8Array(0), bodies: [] };

export const createInertPhysicsWorld: PhysicsWorldFactory = () => {
  const world: PhysicsWorld = {
    step(input) {
      if (input.spawns.length > 0) {
        throw new Error(
          "This core was started without a physics engine: it cannot create products. Start it through main.ts.",
        );
      }
      return { products: [], spawns: [] };
    },
    remove: () => undefined,
    castRays: (rays) => rays.map(() => null),
    snapshot: () => EMPTY_SNAPSHOT,
    restore: () => undefined,
    dispose: () => undefined,
  };
  return world;
};
