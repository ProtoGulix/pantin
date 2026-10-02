# 0033. Assembly placement, and joint frames relative to assemblies

- Status: accepted
- Date: 2026-10-02
- Amends: ADR 0011 (point 1: reference configuration and the frame of joint
  origins and axes; point 4: what a pose carries), ADR 0019 (point 9: moving
  a body to another assembly)
- Extends: ADR 0019 (assemblies), ADR 0017 (STEP import joints)

## Context

On the Pantin "test" (2026-10-02) the user imported a linear axis
(`3630.00.0800N_0`) and a clevis (`chape_nd032a`) as two assemblies and could
not put the clevis on the carriage. Nothing in the document can express it:

- ADR 0011 point 1: every body stays where its mesh file places it; that is
  the reference configuration, and joint origins and axes are expressed in
  the Pantin frame in that configuration.
- A fixed joint carries an `origin` and an `axis` that it never uses
  (ADR 0017 point 2): a joint links bodies, it does not place them.
- ADR 0019: an assembly "never enters pose computation".

So the only way to move an imported part today is to move it in the CAD and
import it again. Two imports of one file land at the same place, which
breaks the target case of ADR 0019 (two cylinders from one file).

Since joint origins and axes are in the Pantin frame, moving a body or an
assembly without rewriting them would leave its joints behind. The frame of
a joint has to move with what it belongs to.

A CAD assembly solver (constraints, closed loops) is not needed: bodies form
a forest (ADR 0011 point 3), so a placement is a plain rigid transform along
that forest. Closed kinematic loops stay out of scope.

Checked in the code on 2026-10-02: `pantin.json` is at `schema_version` 9
(`PANTIN_SCHEMA_VERSION`, `packages/protocol/src/pantin.ts`), and the viewer
composes a body pose with the reference transform of its node, it does not
replace it (`displacedNodePlacement`, `packages/viewer/src/frames.ts`).

## Decision

1. **A placement per assembly.** Every assembly gets a required `placement`:
   a rigid transform (translation in metres, unit quaternion, same
   representation as poses, ADR 0011 point 4). The frame of an assembly is
   the frame of the files it was imported from; its bodies keep the
   placement their mesh file gives them, now relative to that frame.
2. **Anchor.** An assembly is anchored either to the world, or to another
   assembly: the assembly of the parent body of the joint between assemblies
   whose child body belongs to it. Its `placement` is expressed in the frame
   of its anchor. An assembly has at most one incoming joint between
   assemblies, and anchors form a forest: a joint that would give an
   assembly a second anchor, or close a loop of anchors, is refused
   (`conflict`) with a message naming the joint already in place. The anchor
   is derived from the joints, never stored.
3. **Joint frames.** A joint's `origin` and `axis` are expressed in the
   frame of its parent body's assembly, no longer in the Pantin frame. They
   move with that assembly; the core converts them to the Pantin frame when
   it computes motions.
4. **Reference configuration.** Each body's reference placement is the world
   placement of its assembly (its placement composed along its anchors)
   composed with the placement from its mesh file. Position 0 of every joint
   is that configuration, as before.
5. **What a pose carries.** For each body the core sends the transform to
   apply to the mesh as its file places it: the joint displacement of
   ADR 0011 point 4 composed with the world placement of the body's
   assembly. The viewer keeps one way of applying a pose and computes no
   placement of its own.
6. **Edits keep the world pose.** Creating a joint between assemblies,
   deleting it, or changing its parent re-anchors the child assembly; the
   core rewrites that assembly's `placement` so that nothing moves on
   screen. The same holds for every assembly anchored to it.
7. **Moving a body to another assembly** (ADR 0019 point 9). Bodies get an
   optional `placement` relative to their assembly, absent meaning identity.
   When a body changes assembly, the core writes it so that the body does
   not move, and rewrites the `origin` and `axis` of the joints whose parent
   is that body into the frame of the new assembly. In this ADR only the
   core writes a body placement; editing it is backlog.
8. **API.** `PUT .../assemblies/:assemblyKey/placement` sets the placement
   in the anchor frame. The response gives the new placement and the anchor
   (`world` or an assembly key). The core normalises the quaternion and
   refuses a non finite value or a quaternion too far from unit length
   (tolerance in the schema).
9. **Runtime.** A placement edit is a document edit: joint positions,
   setpoints and drive states are kept. The new poses reach the viewer like
   any other edit, paused clock included (ADR 0032).
10. **Schema.** `schema_version` 9 to 10. Migration: every assembly gets
    the identity placement. Since every frame is then the Pantin frame,
    joint origins and axes keep their numbers. A document whose joints
    between assemblies break point 2 (two anchors, or a loop) cannot be
    migrated silently: the migration fails with a message naming the
    joints, and the validator (ADR 0021) reports the same.

## Rejected alternatives

- Using the `origin` of a fixed joint as the placement of its child: a joint
  links bodies; the field means something else for every other type, and a
  body without a joint could still not be placed.
- A placement per body only: moving a cylinder means moving each body and
  every joint between them by hand; the assembly is the unit the user
  places, as in CAD.
- Joint origins kept in the Pantin frame and rewritten by the core on every
  placement edit: correct but every edit rewrites joints the user did not
  touch, and rounding accumulates over successive moves.
- Joint origins in the parent body frame (URDF style): rejected by ADR 0011
  for the same reason as before (rotated, invisible body frames).
- Persistent mates solved by a constraint solver: a CAD kernel feature, not
  needed for a forest, and it would have to be solved again on every import.
- Anchors stored in the document: a second source of truth next to the
  joints.

## Consequences

- The core gains frame composition along anchors (plain transform code,
  ADR 0011 point 8, no dependency), and the frame change of joint origins
  before computing motions.
- Every place that creates or edits a joint between assemblies, or moves a
  body between assemblies, must rewrite placements to keep the world pose;
  each gets a test proving that no body moves.
- Two imports of one file can be placed side by side.
- Tests to write: identity migration leaves every pose unchanged bit for
  bit; placing an anchor assembly moves its anchored assemblies; a revolute
  joint in a moved assembly turns about its moved axis; the refusals of
  point 2.
- ADR 0011 and ADR 0019 get "Amended by: ADR 0033".
- Placement editing in the viewer: ADR 0034. Alignment by picked faces:
  ADR 0035.
