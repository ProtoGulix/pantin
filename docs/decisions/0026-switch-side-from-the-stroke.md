# 0026. Switch side deduced from the stroke, and a dimensioned switch diagram

- Status: accepted
- Date: 2026-09-30
- Amends: ADR 0025 (point 3: the direction parameters go; point 2: zones
  depend on the joint), ADR 0024 (the form gets a diagram)

## Context

On the Pantin "test2", an inductive switch watching a cylinder whose stroke
is 0 to 125 mm had its face at 2 mm, Sn 5 mm, and "target approaching:
forwards (+)". Its on zone was therefore [−3 mm, +∞[: on over the whole
stroke. Nothing in the code was wrong; the parameter was:

- `approach` (inductive) and `actuation` (limit switch) read as a direction
  of motion, but over a cycle the target moves both ways. What they really
  fix is the side of the face (or of the operating point) where the target
  is, a mounting fact.
- For the inductive switch the label is also inverted with respect to that
  fact: a target on the + side of the face is "approaching backwards (−)".
- The form defaults a choice to its first option, so "forwards (+)" was
  chosen for a switch at the lower end of the stroke.
- The drawn zone (−3 mm to 2 mm) sat at the lower end and looked right; the
  actual on zone was not visible anywhere.

Separately, a continuous joint keeps its angle over several turns, so a
switch on it only switches during the first turn.

The user asked on 2026-09-30 to remove the parameter and deduce the side
from the stroke, to refuse a face placed where the target would hit it, and
to draw each switch as a diagram with its dimensions.

## Decision

1. **No direction parameter.** `approach` and `actuation` are removed. The
   side is deduced from the watched joint's limits:
   - inductive switch: the face must lie outside the stroke or on one of its
     ends; the target is on the side where the stroke is. A face strictly
     inside the stroke is refused: the target would hit it.
   - limit switch: the operating position lies inside the stroke and the
     switch is pressed towards the nearer end. An operating position at
     mid-stroke is refused (no nearer end). The stroke must not go past the
     operating position plus the overtravel: the switch would be destroyed,
     so that is refused too.
2. **Zones depend on the joint.** A type's `zone.ts` receives its fields and
   the joint's stroke. The rules above live in the type's `schema.ts` (data
   checks, no evaluation, so the protocol applies them when it validates the
   document). A sensor edit, or a joint edit (limits, type), that breaks one
   is refused with a message naming the sensor and the joint. The rules
   tolerate a nanometre (or nanoradian) of rounding: 100 mm − 98 mm is not
   exactly 2 mm in floating point.
3. **Continuous joints.** They have no stroke, hence no side: the limit
   switch and the axial inductive switch are refused on them. Window
   switches (ideal, cylinder) read the angle within one turn; a window
   crossing 0° is written with a negative lower bound (−10° to 10°).
   A cam switch type (an angular window with hysteresis) may come later.
4. **A dimensioned diagram in the sensor form.** Each switch type describes
   in a `diagram.ts` of its folder its symbol (face, plunger, slot sensor) and
   its dimensions as data: from which coordinate to which, and which
   parameter each one shows. The viewer draws them generically over the
   joint's stroke, with the on zone and the hysteresis band, dimension lines labelled with the parameter's label and
   value in display units. The diagram follows the fields while they are
   typed, and shows a refused placement (face inside the stroke, overtravel
   exceeded) in red with the reason, before anything is sent. Values are
   still typed in the fields.
5. **Schema version 8.** The migration removes `approach` and `actuation`.
   An inductive face strictly inside the stroke is moved to the nearer end
   of the stroke: its old direction was the mistake this decision fixes. A
   limit switch whose overtravel falls short of its end gets an overtravel
   reaching it (the overtravel is only drawn, so its behaviour does not
   change). A limit switch whose side would change, and any switch the new
   rules still refuse (on a continuous joint, at mid-stroke, outside the
   stroke), becomes an ideal switch over its old on zone clipped to the
   stroke, or over its old drawn zone on a continuous joint: every version 7
   document still opens and behaves as before, but for the hysteresis.
   `pantin validate` reports that the file was migrated; the moved face shows
   in the diagram.

## Rejected alternatives

- Renaming the parameter to a side ("active zone on the + / − side"):
  correct, but it keeps a choice that the stroke already determines, and a
  default that can be wrong.
- Deducing the side from the larger part of the stroke without refusing
  anything: it guesses for a face inside the stroke, a placement that is
  physically impossible anyway.
- Warning instead of refusing a face inside the stroke: the user preferred a
  document that cannot hold an impossible machine.
- Draggable points on the diagram: more work (drag, rounding, units) for
  little gain once the diagram follows the fields live.

## Consequences

- Every switch placement becomes checkable against the machine, at the cost
  of coupling sensors to their joint's limits: changing a stroke may be
  refused until a sensor is moved.
- The viewer reads zones with the joint, for the markers (ADR 0024) as for
  the diagram.
- "Add end-of-stroke switches" (ADR 0025 point 6) already satisfies the
  rules: operated 2 % before each end, overtravel 2 %.
- A community switch type writes a `zone.ts`, a `diagram.ts`, and a
  placement rule in its `schema.ts` when its stroke constrains it.
- test2 will open with its face moved from 2 mm to 0 mm, on below 5 mm.
- The diagram does not show the joint's current position yet: the sensor
  panel does not receive joint positions, which go straight to the sliders.
- To verify: the diagram's legibility for a revolute joint (an unrolled
  bar), in a browser.
