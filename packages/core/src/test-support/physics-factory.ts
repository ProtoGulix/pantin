import { createPhysicsWorldFactory, loadRapier } from "../physics/rapier-world.ts";

// The real Rapier build for service tests: the WASM module loads once per test
// file (about 73 ms), the build being deterministic (ADR 0043 point 9).
export const testPhysicsWorldFactory = createPhysicsWorldFactory(await loadRapier());
