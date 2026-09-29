# 0018. Changing a joint's type keeps its id

- Status: accepted
- Date: 2026-09-29
- Corrects: ADR 0017 point 6

## Context

ADR 0017 point 6 says that a fixed joint created by a STEP import becomes a
slider or a pivot through `PATCH .../joints/:jointId`, keeping its id and so
its tags. The core refuses it: `updateJointInDocument` answers
`invalid_request` when the type changes (joint-rules.ts:83-87), and api.ts
documents the refusal. No ADR decided it; it came with the PATCH route
(commit 9f3708f). Deleting and recreating the joint may change its id (ids
come from the name, joint-rules.ts:68), hence its tags (ADR 0012), and
loses its place in the document.

The viewer shows the type read only (properties-model.ts:76). The joint
form of ADR 0016 only creates, and a type's parameters have no safe default
(a zero helical pitch is refused, helical.ts).

The user approved this decision on 2026-09-29.

## Decision

1. `PATCH .../joints/:jointId` accepts a request whose `type` differs from
   the stored one. The request is complete, as for creation: shared fields
   plus the parameters of the new type. The id stays, and so does the tag
   key of ADR 0019.
2. Runtime state follows the new type: the position is clamped to the new
   limits (ADR 0011 point 5), and when the new type cannot move, the
   position, the setpoint and the queued setpoint are cleared, as when a
   joint is deleted.
3. The link rules (one parent, no cycle) are checked as for any update.
4. In the viewer, "Change type" opens the ADR 0016 joint form prefilled with
   the joint's name, bodies, origin and axis; the user picks the type and
   fills its parameters; submitting sends the PATCH. The form stays built
   from `JOINT_PARAMETERS`, with no joint type tested by name.

## Rejected alternatives

- Keep the refusal and delete then recreate: the id, the tags and the
  joint's place in the list may change; ADR 0017's import workflow loses
  its point.
- Default parameter values per type, so that the type can change in one
  click: no safe default exists for every type (pitch), and a made up
  course would move the part where the user did not ask.
- A dedicated route (`PUT .../joints/:jointId/type`): a second way to write
  the same fields.

## Consequences

- ADR 0017 point 6 becomes true; ADR 0017 links here ("Corrected by").
- The joint form gains an update mode; its labels are compiler checked
  (ADR 0016 point 3).
- The PLC side will see tags appear or disappear when a joint becomes
  movable or fixed; nothing consumes tags yet (phase 7).
