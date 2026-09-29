# 0016. Joint editing in the viewer

- Status: accepted
- Date: 2026-09-29
- Extends: ADR 0013 (joint type registry)

## Context

Phase 3 ends when a part of the user's own moves correctly on screen
(CLAUDE.md section 13.3). Without a way to create joints from the viewer,
that needs hand-written API calls. The user approved on 2026-09-29 to bring
joint editing and slider preview forward from phase 8. ADR 0013 requires a
joint type to be addable without searching the code: that must hold for the
viewer too.

## Decision

1. The viewer lists the joints of the open Pantin in the tree's joint
   folder, shows the selected joint's properties, deletes a joint from its
   context menu, and creates one with a form: type, name, parent body, child
   body, origin, axis, then the parameters of the chosen type.
2. Each joint type declares its parameters in its protocol module, as data:
   the field name and its kind. Kinds are `coordinateRange` (the limits, in
   the unit of the joint's coordinate) and `length`. The registry exposes
   them as `JOINT_PARAMETERS`, a record keyed by joint type, so the compiler
   asks for them. A protocol test checks that every declared field exists in
   the type's request schema. The viewer builds the form from this
   description and never tests a joint type by name.
3. Labels are translations of the viewer, keyed by joint type and by
   parameter field; the message catalogue is typed so that a missing label
   does not compile.
4. The user sees millimetres and degrees; the core receives metres and
   radians (CLAUDE.md section 5). The conversion happens in one viewer
   module, like the frame conversion in `frames.ts`.
5. Each joint that can move has a slider over its limits (continuous joints:
   -360° to 360°). Moving it sends `PUT .../joints/:jointId/position`; the
   bodies move through the pose stream (ADR 0015), not by local computation.
6. Validation happens in the protocol schema: the viewer validates the
   request before sending it and shows the schema's message; the core
   answers the same rules.

## Rejected alternatives

- One hand-written form per joint type: every new type would touch the
  viewer's form code.
- Generating the form from the Zod schema's internals: tied to Zod's
  internal structure, and the schema does not say which number is a length.
- Moving bodies locally while dragging the slider: simulation logic in the
  viewer, forbidden by CLAUDE.md section 3.2.

## Consequences

- Adding a joint type now also means declaring its parameters (protocol) and
  its labels (viewer); both are compiler-enforced and listed in
  docs/guides/adding-a-joint-type.md.
- A new parameter kind (an angle parameter, a vector) needs a viewer change
  once, then serves every type.
