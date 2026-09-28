# Spike 0002. Rapier headless under Node

- Date: 2026-09-28
- Question: can the core run Rapier (WASM) headless under Node 24 at a fixed
  step, transport products on conveyors at surface speed, detect them with
  presence sensors, stay deterministic, and fit a 1/240 s budget?
- Verdict: **feasible**. Use `@dimforge/rapier3d-deterministic-compat` 0.21.0
  (Apache-2.0). Conveyor transport works with a kinematic velocity-based belt
  that is teleported back after each step (method A below): measured product
  speed 0.5000 m/s for a 0.5 m/s set point, correct queueing against a stop.
  Runs bit for bit reproducible across processes, snapshot/restore included.
  500 active boxes do **not** fit 1/240 s on the test machine (5.1 ms/step)
  but fit 1/120 s; 50 boxes use about 0.5 ms/step.

## Setup

- Node v24.21.0 (nvm), Linux x86_64, Intel Core i3-10100 (4 cores), 23 GB RAM.
- Throwaway scratch project (session scratchpad), nothing added to the repo.
- Packages, all 0.21.0, published 2026-09-25, licence Apache-2.0 (npm
  registry, `npm view`; package README "Feature selection"):

| Package | Unpacked | WASM loading | Node 24 ESM |
| --- | --- | --- | --- |
| `@dimforge/rapier3d` | 5.0 MB | `import * as wasm from "./x.wasm"`, extensionless imports, only a `module` field | fails as is; works with a resolve hook adding `.js` plus Node's experimental WASM ESM integration (ExperimentalWarning) |
| `@dimforge/rapier3d-deterministic` | 5.0 MB | same | same |
| `@dimforge/rapier3d-compat` | 15.0 MB | WASM inlined as base64, `exports` with `import`/`require`, `await RAPIER.init()` | works, ~75 ms load+init |
| `@dimforge/rapier3d-deterministic-compat` | 15.1 MB | same | works, ~73 ms |
| `@dimforge/rapier3d-simd-compat` | 15.8 MB | same, needs WASM simd128 | works, ~84 ms |

- The README states the default and SIMD builds are only locally
  deterministic (same machine), while `-deterministic` guarantees
  cross-platform determinism at some speed cost. There is no
  `deterministic-simd` build. Releases are pre-1.0 (0.19.3 in 2025-11, 0.20.0
  in 2026-08, 0.21.0 in 2026-09): minors may break the API, pin exactly.
- Headless: the `-compat` builds ran in plain `node`, no flag, no browser API.

## Scenario

Z up, SI. Static floor; belt = kinematic velocity-based cuboid (0.6 m wide,
top at z = 0.5 m, 32 m long); 50 boxes 0.3 x 0.2 x 0.2 m, 5 kg (`setMass`),
friction 0.5, dropped 0.15 to 0.19 m above the belt, 0.4 m pitch. Belt speed
0.5 m/s, timestep 1/240 s (also 1/120 s), 10 s simulated. The 500 box variant
uses a 3 m wide belt, 5 boxes per row. Speed statistics are sampled every step
after t = 2 s, only on boxes whose contact manifold with the belt is non empty.

## Results

### Conveyor transport (question 3)

Rapier JS exposes `PhysicsHooks` with `filterContactPair` and
`filterIntersectionPair` only: **no contact modification hook**, so no per
contact tangent velocity from JS. Three methods tried:

- A. Treadmill: belt body `kinematicVelocityBased`, `setLinvel(0.5, 0, 0)`,
  and after each `world.step()` `belt.setTranslation(home, false)`. The
  solver sees a moving surface, the belt never leaves its place.
- B. Belt is a zero friction static surface (`setFriction(0)`, combine rule
  `Min`); before each step, every box in contact gets `setLinvel(0.5, 0, vz)`.
- C. Same zero friction belt; before each step a box in contact gets an
  impulse towards belt speed, clamped to `mu * g * dt` (friction emulated in JS).

| Method | vx on belt, mean / min / max (m/s) | mean travel in 10 s | stop at x = 21 m (20 s) |
| --- | --- | --- | --- |
| A | 0.49999 / 0.5000 / 0.5000 | 4.939 m | queue of 5, front 1.6 mm into stop, vx 0.0006 |
| B | 0.50000 / 0.5000 / 0.5000 | 4.940 m | **fails**: boxes pushed 0.46 m through the stop, vx 0.28 |
| C | 0.50000 / 0.5000 / 0.5000 | 4.916 m | queue of 5, 1.6 mm, vx 0.008 |

The 60 mm shortfall versus 5.0 m is the drop and the ~0.1 s friction
acceleration (a = mu g). Same speeds at 1/120 s and with 500 boxes.

A wins: native friction (slip, queueing), no per-box JS, a drive ramp is one
`setLinvel`. B ignores obstacles (unusable for stops, gates, pushers). C
behaves like A but costs a JS contact query per box (+1 ms/step at 500 boxes).

### Presence sensor (question 4)

Sensor: a 2 mm thick sensor cuboid across the belt, `COLLISION_EVENTS`,
drained from an `EventQueue` after each step. Ray: `world.castRay` across the
belt after each step. Latency = detection time minus the true crossing time
of the box front corner (interpolated between steps), in steps:

| Detector | 1/240 s | 1/120 s |
| --- | --- | --- |
| Sensor collider events (7 to 35 crossings) | 1.00 to 1.98 steps | 1.01 to 1.78 steps |
| Ray cast after the step (5 crossings) | 0.08 to 0.86 steps | 0.39 to 0.89 steps |

Sensor collider events lag one extra step: the narrow phase runs on the
positions at the start of the step. Scene queries (ray, and presumably
`intersectionsWithShape`, not measured) see the post-step positions, so they
are exact to one step. At 1/240 s and 0.5 m/s one step is 2.1 mm of travel.

### Determinism (question 5)

SHA-256 over Float64 copies of position, rotation, linvel, angvel of all boxes
after 10 s:

- Two runs in the same process (separate module instances, shared WASM
  instance) and two separate processes: identical hashes for every package
  and method tested (compat, deterministic-compat, simd-compat; A and B).
- `rapier3d-compat` and `rapier3d-deterministic-compat` produced the **same**
  hash on this machine; `simd-compat` produced a different one (different
  arithmetic order), still reproducible run to run.

### Performance (question 6)

`world.step()` only, ms, after 1 s warm-up (tick = step plus the spike's own
JS instrumentation, an upper bound):

| Build | 50 boxes mean / p99 | 500 boxes mean / p99 | 500 boxes tick |
| --- | --- | --- | --- |
| compat | 0.50 / 0.83 | 4.90 / 7.19 | 5.9 |
| deterministic-compat | 0.52 / 0.85 | 5.09 / 6.76 | 6.0 |
| simd-compat | 0.24 / 0.48 | 2.12 / 3.33 | 3.1 |

Budget 1/240 s = 4.17 ms: 50 boxes are 8x under (~1900 steps/s); 500 active
boxes exceed it with the deterministic build (~200 steps/s), fit with SIMD.
Step cost barely depends on dt (500 boxes at 1/120 s: 5.17 ms, budget 8.3 ms).

### Snapshot and restore (question 7)

`world.takeSnapshot(): Uint8Array` and `World.restoreSnapshot(bytes)` exist.
Snapshot at t = 5 s, restore into a new world, continue to 10 s:

| Boxes | Size | take | restore | final hash vs uninterrupted run |
| --- | --- | --- | --- | --- |
| 50 | 95 to 104 kB | 2.6 ms | 9 ms | identical |
| 500 | 0.95 to 1.0 MB | 4.3 ms | 15 to 20 ms | identical |

Handles survive the restore (`getRigidBody(handle)`, `getCollider(handle)`),
the belt velocity and timestep too. The timestep is stored as f32
(0.0041666669).

## NOT VERIFIED

- Cross-platform determinism (other CPU, OS, Node or V8 version, ARM): only
  one machine tested; the claim comes from the README.
- Determinism when the JS side feeds floats computed with `Math.sin`/`exp`
  etc. into Rapier (JS transcendental results may differ between engines).
- Curved belts, roller conveyors, transfer between two belts, inclined
  belts, belts that start/stop with a ramp, boxes straddling two belts.
- `intersectionsWithShape` latency (inferred from the ray result).
- Long runs (hours): memory growth, EventQueue behaviour under load.
- Non compat builds without the resolve hook; stability of WASM ESM in Node.
- Performance with sleeping bodies, trimesh products, many belt bodies.

## Consequences for the design

1. Dependency to add to `packages/core` when phase 1 starts (not added now):
   `@dimforge/rapier3d-deterministic-compat`, exact version pin. Keep the
   import behind a small physics module so switching to `simd-compat` (2.4x
   faster, local determinism only) is one line.
2. Conveyor model: one kinematic velocity-based body per belt section,
   velocity = drive's actual speed along the belt axis, teleported back after
   every step. Belt friction lives on the collider (product material).
   CLAUDE.md section 5 item 5 can move from NOT VERIFIED to verified for
   straight belts.
3. Presence sensors: implement as scene queries (ray or shape cast) run after
   `world.step()`, not as sensor collider events, to avoid the extra step of
   latency; add the configured sensor delay on top.
4. Fixed step: 1/240 s is should hold up to roughly 300 active products on this CPU (extrapolated, p99 margin included)
   with the deterministic build; offer 1/120 s or SIMD for larger scenes, and
   measure the whole tick, not only `world.step()`.
5. Reset and replay: `takeSnapshot()` right after scene build gives an exact
   reset; restore returns a new World, so the core must re-resolve body and
   collider objects from stored handles.
