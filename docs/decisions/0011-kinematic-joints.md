# 0011. Kinematic joints, reference frame and schema version 2

- Status: accepted
- Date: 2026-09-29

## Context

Joints are the kinematic core of the product (CLAUDE.md sections 5 and 13.2).
Bodies are displayed where their mesh file places them; spike 0001 showed
that a component's own frame can be rotated relative to its parent (the
carriage frame is turned 180° about Y), so joint data expressed in body
frames would be error prone to type by hand. The user approved this model on
2026-09-29.

## Decision

1. Reference configuration: every body where it was imported. A joint's
   `origin` and `axis` are expressed in the Pantin frame (Z up, metres) in
   that configuration; position 0 of every joint is that configuration.
2. Types: `fixed`, `prismatic` (limits in metres), `revolute` (limits in
   radians), `continuous`. The schema is a discriminated union on `type`, so
   cylindrical, spherical or planar joints can be added without rewriting.
3. Structure: a joint links a parent body to a child body; a body has at
   most one parent joint; no cycle. The joints form a forest; bodies without
   a parent joint stay fixed. The world as a parent is a later addition.
4. Pose: each body's pose is a rigid displacement from its reference
   placement, `P(child) = P(parent) ∘ M(q)`, where `M(q)` is a translation of
   `q · axis` (prismatic) or a rotation of `q` about the axis through `origin`
   (revolute, continuous), the identity for `fixed`. Poses are exchanged as a
   translation plus a unit quaternion in the Pantin frame; the viewer
   converts them at its single frame boundary (`frames.ts`).
5. Joint positions are runtime state owned by the core, never saved, reset to
   0 when a Pantin is opened. The core clamps a requested position to the
   limits, and the default 0 as well when the limits exclude it; the viewer
   never decides the clamping.
6. `pantin.json` gets `schema_version` 2 with a `joints` array. The core
   migrates version 1 documents on read (adds `joints: []`); the migrated
   document is written as version 2 on the next save. Migrations live in the
   core (CLAUDE.md section 11.2), one pure function per version step, tested.
7. Deleting a body used by a joint is refused (`conflict`) with a message
   asking to delete the joint first.
8. Kinematics is plain vector and quaternion code in the core, no dependency.
   Positions are set through REST for now (one request in flight, latest
   value wins in the viewer); the tag bus WebSocket replaces it later.

## Rejected alternatives

- Origin and axis in the parent body frame (URDF style): exact for chains,
  but the frames of imported meshes are invisible to the user and may be
  rotated, so hand-typed coordinates would often be wrong.
- Saving joint positions: the saved file would depend on where a slider was
  left; an initial position can be added later as an explicit field.
- Clamping in the viewer: two sources of truth.

## Consequences

- Joint creation and deletion go through the core; a later visual
  picking of points and faces fills the same fields.
- Every published schema change now has a version step and a migration.
