# 0043. Products, presence sensors and straight conveyors

- Status: accepted
- Date: 2026-10-12
- Applies: ADR 0005 (Rapier build, step, belt method, ray cast sensors)
- Extends: ADR 0028 (action chain), ADR 0023 and 0025 (sensor type folders,
  stateful evaluation), ADR 0019 (tag keys), ADR 0015 (pose stream),
  ADR 0012 (tag writes), ADR 0032 (reset leaves the clock), ADR 0037
  (cascade deletion)
- Changes: CLAUDE.md sections 4 (Rapier behind a physics boundary in core),
  5.4 and 5.5 (presence sensors, products, conveyors), 13 (phase 6 exit)

## Context

Phase 6 of the roadmap (CLAUDE.md section 13): products, presence sensors,
conveyor. Spike 0002 and ADR 0005 settled the engine and the methods. The
user approved on 2026-10-12:

- Exit criterion: an automated core test with no viewer. An emitter puts a
  carton on a 1 m belt running at 0.5 m/s. A photoelectric cell at 0.6 m
  switches on, then off, at the same step numbers on every run. The
  absorber destroys the carton. Two runs are bit-identical. The user then
  demonstrates the same scene in the viewer.
- Dependency `@dimforge/rapier3d-deterministic-compat`, pinned at exactly
  0.21.0 (still the latest on npm, published 2026-09-25, Apache-2.0), in
  `@pantin/core` only. Step 1/120 s. A belt is a kinematic body moved at
  surface speed and put back at its home pose after each step. Presence
  sensors are ray casts run after the step.
- The conveyor follows the action chain of ADR 0028: contactor or VFD,
  then `ac_motor`, then a continuous joint (the drum), then the belt.
  Surface speed = drum angular speed × drum radius.
- Products are boxes. An emitter spawns one box on a command tag (written
  by hand until phase 7). An absorber destroys the boxes inside it. Reset
  clears every product (snapshot and restore).
- New sensor type folder `photoelectric`: a ray with adjustable range, or
  a through-beam barrier, NO or NC, with a delay.
- Colliders: belts and plain box guides or end stops. No collider is made
  from machine meshes.
- Public schema version 12, with a migration.
- To the backlog: curved conveyors, rollers, transfers between belts, mesh
  colliders (pusher cylinder), the inductive presence sensor filtered by
  material.
- User answers on 2026-10-12 to the architect's questions: a reset route
  that keeps unsaved edits (point 12), presence sensors in their own
  `presenceSensors` array (point 8), spawn on a rising edge latched at the
  tag write (point 5).

Facts checked in the repository on 2026-10-12:

- `PANTIN_SCHEMA_VERSION` is 11 (`protocol/src/pantin.ts`). The document
  has top-level arrays `assemblies`, `bodies`, `joints`, `drives`,
  `actuators`, `sensors`, and the core migrates one version at a time on
  read (`core/src/domain/migrations.ts`, one pure function per step).
- Drives, actuators and sensors carry `assembly` (a key). Drives and
  sensors also carry `tagKey`. Their tags are
  `<assembly>.<tagKey>.<member>` (`domain/tags.ts`). `domain/tag-keys.ts`
  makes a key unique per assembly across joints, drives and sensors.
- `SensorSchema` = shared fields (`name`, `assembly`, `joint`) ∩
  `SensorFieldsSchema`, the discriminated union in
  `sensor-types/src/schemas.ts`. `SensorInput` holds a joint position and
  stroke (`evaluation-common.ts`). The core reads `sensor.joint` at about
  15 call sites in core, protocol and viewer.
- `stepSimulation` is pure: drives, then actuators. Joint sensors are
  stepped after it in `service/simulation.ts#runStep`, which reads every
  result before storing any (ADR 0031 point 3, as that file cites it).
  The new joint velocities come out in `SteppedState.jointVelocities`.
  `moveAtVelocity` stores the velocity used, 0 at a limit.
- Runtime state lives in `OpenPantin` (`service/open-pantins.ts`). The
  only reset today is `resetRuntimeState`, called by discard, which also
  reloads the saved document. It leaves the clock and the step count
  alone (ADR 0032 point 1).
- `PoseSnapshotSchema` = `PoseResponseSchema` (`jointPositions`,
  `bodies`) plus `stepCount`. `hasMoved` compares the JSON of
  `jointPositions` and `bodies` (`domain/pose-stream.ts`).
- The viewer reads sensor states from tags, polled every 250 ms (ADR 0024
  points 4 and 5).
- Spike 0002: `world.takeSnapshot()` and `World.restoreSnapshot()` work and
  are exact. Restore returns a new World, so stored handles must be
  resolved again. `-compat` builds need `await RAPIER.init()`, about 73 ms.

## Decision

1. **Frames.** Every phase 6 object is placed by `assembly` (key,
   required), `body` (body id, optional, which must belong to that
   assembly) and `placement` (`PlacementSchema`, required). With `body`,
   the placement is relative to that body's frame as currently posed, so
   the object follows the body. Without it, the placement is relative to
   the assembly frame. The core works out world poses each step with the
   existing kinematics. One convention, so that a frame taken from a
   picked face (ADR 0035, Z = outward normal) puts an object on the face:
   Z points up out of the supporting face, and the origin is the centre of
   the object's bottom face (the top surface for a belt).
2. **Document, five new top-level arrays**, each with ids unique within
   the array. The core derives ids from the name, as it does for drives.

   | Array | Fields beyond the frame fields of point 1 |
   | --- | --- |
   | `belts` | `id`, `name`, `length`, `width`, `drumJoint`, `drumRadius` |
   | `guides` | `id`, `name`, `size` [x, y, z] |
   | `emitters` | `id`, `tagKey`, `name`, `box` { `size` [x, y, z], `mass`, `material` } |
   | `absorbers` | `id`, `name`, `size` [x, y, z] |
   | `presenceSensors` | `id`, `tagKey`, `name`, and the fields of its type (point 7) |

   Lengths are in metres and mass in kilograms, all finite and positive.
   `material` is one of `cardboard`, `plastic`, `wood`, `steel`,
   `stainless_steel`, `aluminium`, `brass`, `copper`. The metal names
   match `MATERIAL_FACTORS`, so that a future inductive presence sensor
   can reuse them. Document rules (new `protocol/src/pantin-conveyors.ts`):
   the assembly exists; the body exists and belongs to it; `drumJoint` is
   a continuous joint of the Pantin. Several belts may share one drum.
   `tagKey` uniqueness per assembly now covers emitters and presence
   sensors (`tag-keys.ts`, `pantin-assemblies.ts`). Products are runtime
   only and never saved.
3. **Belt.** The surface is the rectangle `length` along +X by `width`
   along Y, centred on the frame origin. The collider is a cuboid with
   that top face and a fixed thickness below it, chosen in P1.
   Positive drum rotation moves the surface along +X; to reverse, the
   user turns the frame. At every step the surface velocity is +X of the
   current world frame × `drumRadius` × the drum joint's velocity from
   this step's actuators. A drum moved only by its setpoint tag (velocity
   0) or jammed does not drive the belt. The Rapier body is
   kinematic velocity-based. After each `world.step()` it goes back to
   the frame's current world pose (spike 0002 method A). The belt has no
   tag: the drive in front of the motor holds them (ADR 0028).
4. **Guides and end stops** are box colliders, `size` centred on the
   frame's Z axis, bottom face at the origin. They are kinematic
   position-based bodies put at their frame's pose before each step, so
   a fixed frame gives a fixed guide. Guides that move with a body share
   that code but are NOT VERIFIED in phase 6.
5. **Emitter.** The emitter has one command tag,
   `<assembly>.<tagKey>.spawn` (bit). A write that takes the tag from 0
   (or never written) to 1 queues one spawn, latched when the tag is
   written, as setpoints are queued (ADR 0012 point 3). A 1-then-0 pulse
   between two steps is therefore never lost, and a PLC holding the bit
   at 1 spawns once. At the next step, emitters in id order put one box
   at rest, its bottom face centred on the frame origin and its axes
   along the frame. A spawn is skipped, with a console event, when the
   box would overlap a product (`emitter_blocked`) or when the Pantin
   already holds 500 products (`product_limit`, the ADR 0005 budget).
6. **Absorber and kill plane.** After the physics step, a product is
   destroyed when its centre is inside an absorber volume (`size`, laid
   out like a guide) or more than 10 m below the Pantin origin, which
   keeps a box that falls off a belt end from falling forever. This test
   is pure and runs on product poses.
7. **Photoelectric sensor type**, folder
   `sensor-types/src/photoelectric/` (`schema.ts`, `evaluate.ts`,
   `labels.ts`):
   - `mode`: `diffuse` (a ray of reach `range`) or `through_beam` (an
     emitter and a receiver `range` apart);
   - `range` in metres, `normallyClosed`, `onDelay` and `offDelay` in
     seconds (0 or more);
   - tag `state` (bit, feedback), so `<assembly>.<tagKey>.state`.

   The beam runs along +Z of the frame, from the origin for `range`. Both
   modes cast the same ray. They differ in what the viewer draws (a
   receiver at the end for `through_beam`). The ray sees products only,
   never belts or guides, so a sensor aimed across a belt does not detect
   the far guide. Background detection goes to the backlog. A product
   whose solid cast hits within `range` makes the raw signal 1 (a ray
   starting inside a box counts). The evaluation is pure: input = fields,
   raw signal, previous state, step seconds; output = values and state,
   as in ADR 0025. A delay counts whole steps,
   `Math.round(delay / dt)`, so a run never depends on floating-point
   time sums. NO/NC inverts the output after the delay.
8. **Sensor family registry.** Presence sensors are a second family in
   `@pantin/sensor-types`, with their own registry beside the joint
   family's: `PresenceSensorFieldsSchema` (a discriminated union, one
   member for now), `PRESENCE_SENSOR_PARAMETERS`,
   `PRESENCE_SENSOR_TAGS`, labels, and `evaluatePresenceSensor` in
   `evaluators.ts`. `SensorParameterKind` gains `length` (mm in clients)
   and `duration` (ms in clients). The protocol still imports schemas
   only. A new presence type is one folder plus one entry in each record.
9. **Physics boundary.** Domain logic stays pure (CLAUDE.md 8.4). The
   domain defines a port, `PhysicsWorld`, in plain data:
   - `step(input)`: belt poses and surface velocities, guide poses and
     spawn requests in; product poses (in spawn order) and spawn results
     out;
   - `remove(productIds)`;
   - `castRays(rays)`: hit distance or null, products only;
   - `snapshot()` and `restore()`.

   Pure domain modules work out what goes in and read what comes out:
   world poses of frames, belt velocities, spawn planning, absorption,
   rays, sensor evaluation. The only module that imports Rapier is
   `core/src/physics/rapier-world.ts`, which dependency-cruiser enforces.
   `main.ts` awaits `RAPIER.init()` once at start-up and puts a
   `createPhysicsWorld` factory in `ServiceContext`, as it does for
   `stepConverter`. Tests use the real build, which is deterministic.
   World settings: gravity (0, 0, -9.81) (Z up, SI), timestep
   `STEP_SECONDS`. One friction coefficient, 0.5 as in spike 0002, on
   every collider. Products never sleep: sleeping bodies are NOT VERIFIED
   (spike 0002), and 500 awake boxes fit the budget.
10. **Step order** at 1/120 s, extending ADR 0028 point 11: drives,
    actuators, joint sensors (all pure, as today); then plan the physics
    input from the new joint state; `world.step` (spawns first, belts put
    back after); absorption and kill plane, then `remove`; ray casts;
    presence sensor evaluation. A box absorbed in a step is therefore not
    seen by a ray in that step. Every pure part runs before
    `world.step`, which mutates the world. If the physics world throws,
    it is restored to its empty snapshot (point 11) and the step is
    reported as a `step_error`, so the rest of the Pantin stays atomic
    (ADR 0031 point 3).
11. **Runtime state and reset.** `OpenPantin` gains a physics runtime:
    the world; its empty snapshot, taken right after it is built from
    the belts and guides; the products (runtime id `p1`, `p2`… in spawn
    order, emitter id, box); the next product number; the last value
    written to each emitter's `spawn`; the queued spawns; and the
    presence sensor outputs. `resetRuntimeState` restores the snapshot,
    which empties the world, resolves handles again, clears products,
    spawns and outputs, and numbers from `p1` again. The clock and the
    step count stay as they are (ADR 0032). Creating, editing or deleting
    a belt or a guide, or a body or joint edit that changes their frame
    definition, rebuilds the world and takes a new snapshot. That clears
    the products, with console event `physics_rebuilt`. Moving frames
    during a run is handled every step, not by a rebuild. "Changes their
    frame definition" means changes the pose of a belt or guide at the
    reference configuration (no joint written, ADR 0012): the world and its
    snapshot are built there, so a fresh open, a rebuild and a reset start
    from the same snapshot. An origin or axis edit of a joint that leaves
    that pose alone, made while the joint has moved, keeps the products;
    the belt takes its new pose at the next step (clarified in P1c).
12. **Protocol and API** (ADR 0015, ADR 0028 point 10 style):
    - Create, edit (whole replacement, as for joints) and delete routes:
      `.../belts`, `.../guides`, `.../emitters`, `.../absorbers`,
      `.../presence-sensors`, each with `/:id`.
    - Deleting a body used as a frame, deleting the drum joint or
      changing its type is refused with `conflict`, naming the users.
      Deleting an assembly cascades to its new objects (ADR 0037).
    - `POST /api/pantins/:pantinId/reset` runs `resetRuntimeState`
      without reloading the document, so a demo can be replayed without
      losing unsaved edits. Discard keeps its behaviour.
    - `PoseResponseSchema`, and so every pose stream event, gains
      `products`: `productId`, `emitterId`, `size`, `material`,
      `translation`, `rotation`, in spawn order. Each product carries its
      size, so that editing or deleting an emitter leaves its boxes
      drawable. `hasMoved` compares `products` too.
    - The spawn tag is written through the existing tag route. The tag
      list adds emitters, then presence sensors, after joint sensors.
    - The JSON Schema is regenerated (ADR 0021).
13. **Viewer.**
    - Draws products as boxes from the pose stream and belts as their
      rectangle with a travel arrow.
    - Draws guides, emitters and absorbers as outlined volumes, and each
      presence sensor's beam, coloured by its `state` tag (ADR 0024
      points 4 and 5).
    - The inspector (ADR 0039) gets create and edit forms for belts,
      guides, emitters, absorbers and presence sensors: frame,
      placement in mm and degrees, sizes, the drum chosen among the
      continuous joints. An emitter gets a "Créer un produit" button
      that writes 1 then 0 to `spawn`. The "Remise à zéro" command calls
      the reset route.
    - French and English labels.
    - The viewer computes nothing and imports neither Rapier nor the
      sensor evaluators.
14. **Migration to schema version 12.** `migrateV11ToV12` adds `belts`,
    `guides`, `emitters`, `absorbers` and `presenceSensors` as empty
    arrays. Nothing else changes, so motion and tags of existing Pantins
    are unchanged.
15. **Slices.**
    - P0: this ADR, plus the dependency (exact pin, lockfile) with the
      Rapier loader and a smoke test (init, one empty step), so that the
      dependency is used when `pnpm check` runs.
    - P1: core physics: port and Rapier adapter, schema v12 and its
      migration, belts, guides, product spawn and destruction, snapshot
      and reset, tests.
    - P2: the `photoelectric` type and the exit criterion test. The test
      uses a paused clock and the step route (ADR 0032 point 3), contactor
      → `ac_motor` → drum (radius × nominal speed = 0.5 m/s), a 1 m belt,
      an emitter at its start, a cell at 0.6 m and an absorber at its
      end. It checks that two fresh runs give equal on and off step
      numbers and an equal SHA-256 over every step's product poses and
      tag values, and that no product remains at the end.
    - P3: protocol: edit routes, the reset route, products in the pose
      stream.
    - P4: viewer, as in point 13, so that the demo needs no hand-edited
      file.
    - P5: user demonstration.

## Rejected alternatives

- **The belt as an actuator type with a speed.** It bypasses the drive and
  motor chain of ADR 0028, so a contactor, a VFD ramp or a jammed drum
  would not show on the belt, and the speed would be held in two places.
- **Rapier sensor colliders** for presence sensors: their events arrive 1
  to 2 steps late (spike 0002, ADR 0005).
- **Setting box velocities** (spike method B): boxes go through end stops
  (0.46 m in the spike). JavaScript friction impulses (method C) cost a
  query per box per step.
- **Presence sensors in `sensors`** with an optional `joint`: every
  joint-sensor call site would have to narrow the type, and the
  evaluation inputs differ (joint position against ray hit). A second
  family keeps both types strict.
- **A product catalogue** (top-level product definitions that emitters
  reference): no shared use yet. It belongs with mesh products.
- **Spawning while the tag is 1**, or on every write of 1: 120 boxes per
  second from a PLC holding the bit, or a count that depends on how
  often the bridge writes.
- **Absorbing on overlap** rather than on the centre: it needs a world
  query, while the centre test is pure.
- **Rebuilding the world on reset** rather than restoring its snapshot:
  both give an empty world, but the snapshot was approved and is the
  exact replay base measured by spike 0002.
- **Rapier calls in domain code:** it breaks CLAUDE.md 8.4 and puts async
  initialisation inside pure step functions.

## Consequences

- The ADR 0028 chain now ends in product motion: a VFD ramp or a jammed
  drum shows on the belt without new code.
- A new presence sensor type is one folder in the presence family.
- `@pantin/core` grows by about 15 MB (WASM inlined as base64) and starts
  about 73 ms later (spike 0002).
- CLAUDE.md is updated: section 4 (physics boundary), sections 5.4 and 5.5
  (field names; straight belts verified), section 13 (phase 6 exit as
  approved). New backlog entries: curved conveyors, rollers, transfers
  between belts, mesh colliders, the material-filtered inductive presence
  sensor, per-material friction, background detection by rays, guides
  on moving bodies, placing phase 6 objects from a picked face, belts in
  the chain diagram (ADR 0029), pushing sensor states instead of polling.
- Editing a belt or guide during a run clears the products. This is
  acceptable while editing is a design-time act.
- NOT VERIFIED, to check in P1 and P2:
  - Whether removed colliders vanish from ray casts before the next
    `world.step()`. Otherwise the query pipeline must be updated by hand.
  - Whether a kinematic belt that starts moving wakes the boxes resting
    on it. Products do not sleep, which sidesteps this.
  - Determinism when quaternions computed with `Math` functions feed
    Rapier (spike 0002), across machines.
  - Whether knip reports the dependency before its first use.
  - The behaviour of guides on moving bodies.
- Next ADR: loads fed back to the drive (a belt stalled by queued boxes)
  and mesh colliders.
