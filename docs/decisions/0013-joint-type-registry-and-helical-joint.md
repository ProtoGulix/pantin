# 0013. Joint type registry and the helical joint

- Status: accepted
- Date: 2026-09-29

## Context

The user wants joint types that are easy to create, maintain and evolve
without searching the whole core (2026-09-29), in the community spirit of
CLAUDE.md section 3.3. After ADR 0011 a joint type was known in three
places: the protocol union, two `switch` statements in the kinematics and a
`fixed` test in the tags. Drives, sensors and the editor would each have
added their own `switch`. The user also chose to stay with single-coordinate
joints for now (pivot, slider, helical) and approved schema version 3 and the
helical coordinate below.

## Decision

1. A joint type is two files, one per package, plus one registration line in
   each package:
   - `packages/protocol/src/joint-types/<type>.ts`: the Zod schema of its
     creation request (shared fields plus its own) and the unit of its
     coordinate (`metre`, `radian`, or `null` when it cannot move);
   - `packages/core/src/domain/joint-types/<type>.ts`: its behaviour, that is
     how a coordinate is clamped and the motion `M(q)` it produces.
2. Registration: the protocol lists the request schemas once (`joint.ts`);
   the stored joint is that union plus an `id`, so nothing else is written by
   hand. The coordinate units and the core behaviours are records keyed by
   joint type: the compiler refuses a type declared in the protocol and
   missing a unit or a behaviour.
3. The rest of the core (kinematics, tags, and later drives and sensors) asks
   the registry and never tests a joint type by name.
4. Every type provides an example to a shared contract test, which checks the
   invariants of all types: the schema accepts the example, `M(0)` is the
   identity, motions are rigid, clamping is idempotent and stays within the
   limits, a joint without a coordinate never moves. A type's own tests cover
   only what is specific to it.
5. Joint types remain core code, reviewed like any core change. A part
   (community content) never brings a joint type: it composes the existing
   ones declaratively (CLAUDE.md section 11.3, no community code without a
   sandbox).
6. Adding a joint type is a schema change: `schema_version` goes up, with a
   migration step that only changes the version. An older core then answers
   "Update Pantin" instead of "invalid file".
7. Helical joint (`helical`): its coordinate is the translation along the
   axis, in metres, like a slider, because a PLC driving a ball screw thinks
   in stroke. The rotation follows: `angle = 2π · q / pitch`, about the axis
   through `origin`. `pitch` is the travel per turn in metres, not zero;
   positive is a right-hand thread (a positive rotation about the axis
   advances along the axis). `limits` are required: a nut has a finite
   travel. `pantin.json` goes to schema version 3.

The steps to add a type are in `docs/guides/adding-a-joint-type.md`.

## Rejected alternatives

- A single generic "joint" with free parameters: every consumer would again
  decode the parameters by hand.
- Building the unions from a list with mapped tuple types: it removes one
  line per type but the types become hard to read (CLAUDE.md section 2.2).
- Joint types provided by parts as code: excluded by the sandbox rule.
- Helical coordinate as the angle: closer to a motor encoder, but the machine
  and the PLC program reason in stroke; a drive can convert later.

## Consequences

- Adding a type touches four files, two of which the compiler points to.
- Multi-coordinate joints (cylindrical, spherical, planar) would change the
  behaviour interface (a vector of coordinates) and the tags; out of scope.
- Setpoint and position tags of a helical joint are in metres.
