# 0022. Drives, and one folder per drive type

- Status: accepted
- Date: 2026-09-30
- Partly superseded by: ADR 0028 (points 3, 4, 5 and 6: drive types, drive document, joint setpoint, behaviour)
- Extends: ADR 0011 (joints), ADR 0012 (tags and fixed step), ADR 0013 (type registry), ADR 0019 (assemblies and tag keys)
- Changes: CLAUDE.md section 4 (the protocol may import drive type schemas)

## Context

Phase 4 (CLAUDE.md section 13.4) adds drives: actuators on a joint's degree
of freedom, driven by PLC tags, each with injectable faults. It ends when a
double-acting cylinder behaves as described, spring return or not. Until now
a movable joint jumps to its `setpoint` tag at the next step (ADR 0012 point
4), which ADR 0012 says phase 4 replaces.

The user decided on 2026-09-30:

- A drive is an entity of its own, not a field of a joint: one drive may
  move several joints (two cylinders on one valve).
- Tag members stay in English; what the user reads is translated.
- Drive types must be self-contained, one folder each, so that they can be
  shared, maintained and improved without touching the rest of the core,
  in line with the community goal (CLAUDE.md sections 2.5 and 3.3).
- `jammed` is a fault of a joint, `unresponsive` a fault of a drive.
- A declarative drive, with no code, goes to the backlog.

Facts checked in the repository on 2026-09-30:

- Joint types are split across packages: schema in protocol, behaviour in
  core, labels in the viewer, each with a registry (ADR 0013).
- The dependency rules forbid the protocol from importing any workspace
  package, and CLAUDE.md section 4 says the protocol holds no logic.
- The `bit` tag type already exists (tag.ts); only `float` tags exist yet.
- Runtime state (positions, setpoints) is keyed by joint id (open-pantins.ts).

## Decision

1. A new package `@pantin/drive-types` holds one folder per drive type:
   `src/<type>/schema.ts` (Zod schema of the type's own fields, its
   parameters and its tags as data), `behaviour.ts` (a pure step function)
   and `labels.ts` (English and French labels, typed after the schema so
   that a missing label does not compile). Registries list the folders:
   `schemas.ts`, `behaviours.ts`, `labels.ts`. The package depends on Zod
   only; behaviours take plain numbers, never protocol types.
2. Imports: the protocol imports `@pantin/drive-types/schemas` only, which
   holds no logic; the core imports the behaviours; the viewer imports the
   schemas and the labels. Dependency-cruiser enforces it. Adding a drive
   type is one folder plus one line per registry, described in
   docs/guides/adding-a-drive-type.md. The simulation loop never names a
   drive type.
3. First drive types, each with fixed tags (a variant is a type, not an
   option, so that the tags stay data):

   | Type | Parameters | Command tags | Feedback tags |
   | --- | --- | --- | --- |
   | `double_acting_cylinder` | speed | `extend`, `retract` (bit) | |
   | `single_acting_cylinder` | speed | `extend` (bit) | |
   | `servo_axis` | max speed, max acceleration | `setpoint` (float) | |
   | `motor_analog` | acceleration | `speed_setpoint` (float) | `speed` (float) |
   | `motor_on_off` | nominal speed, acceleration | `run`, `reverse` (bit) | `speed` (float) |

   Units are SI, in the unit of the driven joints' coordinate (metres or
   radians). A travel runs between each joint's own limits.
4. A drive in `pantin.json` has an id, a name, an `assembly`, a `tagKey`,
   the ids of the joints it moves (at least one) and its type's fields. Its
   tags are `<assembly>.<tagKey>.<member>` (ADR 0019). Document rules: the
   joints exist and can move; a joint is moved by one drive at most; the
   joints of one drive share their coordinate unit; a drive's tag prefix is
   unique in its assembly, among joints and drives alike.
5. Joint tags: every movable joint keeps its `position` feedback. Its
   `setpoint` command exists only while no drive moves it (ADR 0012
   behaviour, kept for setting up and for tests).
6. Behaviour: at every step of 1/120 s, each drive's behaviour receives its
   parameters, its current command values, and for each joint its position,
   velocity and limits; it answers each joint's next position and velocity,
   and its feedback values. Commands are levels, read at every step (a bit
   stays set until written again). A double-acting cylinder with neither or
   both coils set holds its position (CLAUDE.md section 5.3.1); a
   single-acting one retracts when `extend` falls.
7. Faults are runtime state, never saved, cleared when a Pantin is opened:
   `jammed` on a joint (it keeps its position whatever drives it);
   `unresponsive` on a drive (it keeps its last commands and its feedback
   tags freeze, like a lost fieldbus module). They are set through
   `PUT .../joints/:jointId/fault` and `PUT .../drives/:driveId/fault`.
8. Drives are edited through REST routes (create, update, delete) like
   joints; a bit tag accepts 0 or 1 only. The direct position route
   (ADR 0011) still moves a driven joint for setting up; the drive goes on
   from there.
9. `pantin.json` goes to schema version 5; the migration adds `drives: []`.
   The JSON Schema is regenerated (ADR 0021).

## Rejected alternatives

- A drive as a field of its joint: one valve could not move two cylinders.
- One file per package for each drive type, as for joints (ADR 0013): a
  drive type could not be shared as one folder.
- Three modes with options (spring return, analog or on/off command): the
  tags of a drive would depend on its parameters, which is logic in the
  schema files the protocol imports.
- Loading drive types at run time from community folders: they contain
  code, which runs only in a sandbox (CLAUDE.md section 11.3). A declarative
  drive type is in docs/backlog/declarative-drives.md.
- `jammed` and `unresponsive` both on the drive: a jammed cylinder is a
  mechanical fault of one joint, not of the valve that moves two.

## Consequences

- CLAUDE.md section 4 lists `packages/drive-types` and states the new rule.
- The phase 4 exit test drives a double-acting and a single-acting cylinder
  through REST tags with a manual clock, without a viewer.
- Drive types stay reviewed code in the repository; their isolation makes
  review and sharing easier, not safe loading.
