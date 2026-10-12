import { describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createWorld, GRAVITY, loadRapier } from "./rapier-world.ts";

describe("rapier-world", () => {
  it("loads Rapier, creates a world and steps it empty", async () => {
    const rapier = await loadRapier();
    const world = createWorld(rapier);

    expect(() => world.step()).not.toThrow();
    // Rapier stores the timestep as a 32-bit float.
    expect(world.timestep).toBeCloseTo(STEP_SECONDS, 6);
    expect(world.gravity).toEqual(GRAVITY);
    expect(world.bodies.len()).toBe(0);

    world.free();
  });
});
