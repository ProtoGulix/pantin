// The only module of the core allowed to import Rapier (ADR 0043 point 9,
// enforced by dependency-cruiser).
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { STEP_SECONDS } from "../domain/fixed-step.ts";

export type RapierModule = typeof RAPIER;

// Z up, in metres per second squared.
export const GRAVITY = { x: 0, y: 0, z: -9.81 } as const;

// Loads and initialises the WASM build (about 73 ms, spike 0002). The module is
// returned, not cached: the caller (main.ts, later) owns it and passes it down.
export async function loadRapier(): Promise<RapierModule> {
  await RAPIER.init();
  return RAPIER;
}

// An empty world stepping at the core's fixed step.
export function createWorld(rapier: RapierModule): InstanceType<RapierModule["World"]> {
  const world = new rapier.World(GRAVITY);
  world.timestep = STEP_SECONDS;
  return world;
}
