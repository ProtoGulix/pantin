# 0024. Sensor markers in the 3D view

- Status: accepted
- Date: 2026-09-30
- Partly superseded by: ADR 0029 (point 5: when tag values are read)
- Extends: ADR 0023 (joint sensors), ADR 0022 (the joint arrow shows its drive)

## Context

Joint sensors (ADR 0023) appear in the right-hand panel and the tree, not in
the 3D view. The user asked on 2026-09-30 to see them in the simulation,
"along the vector" of their joint, and approved the plan below.

The viewer runs no simulation (CLAUDE.md section 3.2): it must not compute a
sensor's state from a joint position, since that would duplicate the core's
evaluation. It reads tag values only while the right-hand panel is open.

## Decision

1. Every sensor gets a marker, always drawn, not only for the selected joint,
   so that end-of-stroke switches can be seen flipping as a cylinder moves.
2. The shape comes from the sensor type's parameters, never from its name: a
   type with a `coordinateRange` parameter is drawn over that range, along the
   joint's axis from its origin for a joint in metres (a thick segment), or as
   an arc about the axis for a joint in radians; any other type is a small
   ring about the axis at the joint origin.
3. A marker hangs from the joint's parent body, like the joint arrow, and is
   drawn over the bodies. It is hidden with its joint's child body (a hidden
   or isolated assembly).
4. A marker lights up when its type's first bit tag reads 1, grey otherwise;
   a type without a bit tag keeps one colour. The state comes from the tag
   values the core reports, never from a computation in the viewer.
5. Tag values are read every 250 ms while the right-hand panel is open, or
   while the open Pantin has at least one sensor.

## Rejected alternatives

- Markers on the selected joint only: the user wants to watch switches flip
  during a movement, whatever is selected.
- Computing the state in the viewer from the joint position: quicker to show,
  but it would copy the core's evaluation (CLAUDE.md section 3.2), and the
  dependency rules forbid importing it.
- Placing the switch where the moving body's surface would touch it: the
  document does not say where the actuator is on the body; the point on the
  axis where the joint coordinate trips the switch is exact and explainable.

## Consequences

- With sensors in the Pantin, the viewer reads the tag list four times a
  second even with the panel closed, until the tag bus (CLAUDE.md section 9)
  pushes values.
- On a pivot, the arc's angle zero is an arbitrary direction perpendicular
  to the axis: the arc shows the extent of the range, not an absolute angle.
