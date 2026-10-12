import { beforeAll, describe, expect, it } from "vitest";
import type { PhysicsWorld, ProductPose, SpawnRequest } from "../domain/physics-world.ts";
import { IDENTITY_TRANSFORM, type RigidTransform } from "../domain/rigid-transform.ts";
import {
  createPhysicsWorldFactory,
  createRapierPhysicsWorld,
  loadRapier,
  type RapierModule,
} from "./rapier-world.ts";

let rapier: RapierModule;
beforeAll(async () => {
  rapier = await loadRapier();
});

const at = (x: number, y = 0, z = 0): RigidTransform => ({
  ...IDENTITY_TRANSFORM,
  translation: [x, y, z],
});
const BELT = { id: "b1", length: 4, width: 0.6, pose: IDENTITY_TRANSFORM };
const STOP = { id: "g1", size: [0.05, 0.6, 0.3] as const, pose: at(1.5) };
const CARTON = (productId: string, x: number): SpawnRequest => ({
  productId,
  pose: at(x),
  size: [0.2, 0.2, 0.2],
  mass: 1,
});

function stepper(world: PhysicsWorld, speed: number) {
  const belts = [{ id: "b1", pose: IDENTITY_TRANSFORM, surfaceVelocity: [speed, 0, 0] as const }];
  const guides = [{ id: "g1", pose: STOP.pose }];
  return (count: number, spawns: SpawnRequest[] = []): ProductPose[] => {
    let products: readonly ProductPose[] = [];
    for (let index = 0; index < count; index += 1) {
      products = world.step({ belts, guides, spawns: index === 0 ? spawns : [] }).products;
    }
    return [...products];
  };
}

const xOf = (products: readonly ProductPose[], id: string): number =>
  products.find((product) => product.productId === id)?.pose.translation[0] ?? Number.NaN;

describe("Rapier physics world", () => {
  it("carries a box along +X at the belt surface speed once settled", () => {
    const world = createRapierPhysicsWorld(rapier, [BELT], []);
    const run = stepper(world, 0.5);
    const settled = run(240, [CARTON("p1", -1.5)]);
    const later = run(120);
    expect(xOf(later, "p1") - xOf(settled, "p1")).toBeCloseTo(0.5, 2);
    // Resting on the belt: the centre is half the height above the surface.
    expect(later[0]?.pose.translation[2]).toBeCloseTo(0.1, 2);
    world.dispose();
  });

  it("stops a box against a guide", () => {
    const world = createRapierPhysicsWorld(rapier, [BELT], [STOP]);
    const run = stepper(world, 0.5);
    const products = run(1200, [CARTON("p1", 0)]);
    // Guide face at x = 1.5 - 0.025, box half length 0.1.
    expect(xOf(products, "p1")).toBeLessThan(1.475 - 0.1 + 0.005);
    expect(xOf(products, "p1")).toBeGreaterThan(1.3);
    world.dispose();
  });

  it("starts a box resting on a stopped belt when the belt starts", () => {
    const world = createRapierPhysicsWorld(rapier, [BELT], []);
    const stopped = stepper(world, 0);
    const rest = stopped(600, [CARTON("p1", 0)]);
    expect(Math.abs(xOf(stopped(120), "p1") - xOf(rest, "p1"))).toBeLessThan(1e-6);
    const running = stepper(world, 0.5);
    const before = running(1);
    const after = running(240);
    expect(xOf(after, "p1") - xOf(before, "p1")).toBeGreaterThan(0.8);
    world.dispose();
  });
});

describe("Rapier world snapshot and determinism", () => {
  it("restores an empty world, and spawns still work", () => {
    const world = createRapierPhysicsWorld(rapier, [BELT], [STOP]);
    const run = stepper(world, 0.5);
    const empty = world.snapshot();
    run(60, [CARTON("p1", 0)]);
    world.restore(empty);
    expect(run(1)).toEqual([]);
    const again = run(240, [CARTON("p1", 0)]);
    expect(again.map((product) => product.productId)).toEqual(["p1"]);
    expect(xOf(again, "p1")).toBeGreaterThan(0.5);
    world.dispose();
  });

  it("restores a snapshot that holds products", () => {
    const world = createRapierPhysicsWorld(rapier, [BELT], []);
    const run = stepper(world, 0.5);
    run(60, [CARTON("p1", 0)]);
    const snapshot = world.snapshot();
    const expected = run(60);
    world.restore(snapshot);
    expect(run(60)).toEqual(expected);
    world.dispose();
  });
});

describe("Rapier world reset", () => {
  it("replays a scenario on a used, restored world exactly like on a fresh one", () => {
    const scenario = (world: PhysicsWorld) => {
      const run = stepper(world, 0.5);
      return [run(100, [CARTON("p1", -1), CARTON("p2", -1.5)]), run(400, [CARTON("p3", 0)])];
    };
    const fresh = createRapierPhysicsWorld(rapier, [BELT], [STOP]);
    const used = createRapierPhysicsWorld(rapier, [BELT], [STOP]);
    const empty = used.snapshot();
    const run = stepper(used, 0.5);
    run(150, [CARTON("p1", 0), CARTON("p2", -0.5)]);
    used.remove(["p1"]);
    run(50);
    used.restore(empty);
    expect(scenario(used)).toEqual(scenario(fresh));
    fresh.dispose();
    used.dispose();
  });
});

describe("Rapier world determinism and inputs", () => {
  it("gives bit-identical product poses on two identical runs", () => {
    const poses = () => {
      const world = createRapierPhysicsWorld(rapier, [BELT], [STOP]);
      const run = stepper(world, 0.5);
      const first = run(100, [CARTON("p1", -1), CARTON("p2", -1.5)]);
      const last = run(500, [CARTON("p3", 0)]);
      world.dispose();
      return [first, last];
    };
    expect(poses()).toEqual(poses());
  });

  it("reports a duplicate product id without adding it", () => {
    const world = createRapierPhysicsWorld(rapier, [BELT], []);
    const output = world.step({
      belts: [{ id: "b1", pose: IDENTITY_TRANSFORM, surfaceVelocity: [0, 0, 0] }],
      guides: [],
      spawns: [CARTON("p1", 0), CARTON("p1", 1)],
    });
    expect(output.spawns.map((result) => result.status)).toEqual(["spawned", "duplicate_id"]);
    expect(output.products).toHaveLength(1);
    world.dispose();
  });

  it("is built by the factory the service receives", () => {
    const world = createPhysicsWorldFactory(rapier)([BELT], [STOP]);
    const output = world.step({
      belts: [{ id: "b1", pose: IDENTITY_TRANSFORM, surfaceVelocity: [0, 0, 0] }],
      guides: [{ id: "g1", pose: STOP.pose }],
      spawns: [CARTON("p1", 0)],
    });
    expect(output.products.map((product) => product.productId)).toEqual(["p1"]);
    world.dispose();
  });

  it("refuses a step that gives no state for a belt", () => {
    const world = createRapierPhysicsWorld(rapier, [BELT], []);
    expect(() => world.step({ belts: [], guides: [], spawns: [] })).toThrow(/belt "b1"/);
    world.dispose();
  });
});

describe("Rapier ray casts", () => {
  function settledWorld() {
    const world = createRapierPhysicsWorld(rapier, [BELT], [STOP]);
    const run = stepper(world, 0);
    run(120, [CARTON("p1", 0)]);
    return { world, run };
  }

  it("hits a product and ignores belts and guides", () => {
    const { world } = settledWorld();
    const across = (z: number, x = 0) => ({
      origin: [x, -1, z] as const,
      direction: [0, 1, 0] as const,
      maxDistance: 5,
    });
    const [hit, overBelt, throughGuide, inside] = world.castRays([
      across(0.1),
      // Along the belt, above the box: nothing to hit but the belt below.
      { origin: [-1, 0, 0.3], direction: [1, 0, 0], maxDistance: 5 },
      across(0.15, 1.5),
      { origin: [0, 0, 0.1], direction: [0, 0, 1], maxDistance: 1 },
    ]);
    expect(hit).toBeCloseTo(0.9, 2);
    expect(overBelt).toBeNull();
    expect(throughGuide).toBeNull();
    expect(inside).toBe(0);
    // A ray straight down onto the belt below the box would only see the box.
    expect(world.castRays([{ origin: [1, 0, 1], direction: [0, 0, -1], maxDistance: 3 }])).toEqual([
      null,
    ]);
    world.dispose();
  });

  it("no longer hits a removed product before the next step", () => {
    const { world } = settledWorld();
    const ray = { origin: [0, -1, 0.1] as const, direction: [0, 1, 0] as const, maxDistance: 5 };
    expect(world.castRays([ray])[0]).not.toBeNull();
    world.remove(["p1"]);
    expect(world.castRays([ray])).toEqual([null]);
    world.dispose();
  });
});
