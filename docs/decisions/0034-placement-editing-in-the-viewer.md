# 0034. Placement editing in the viewer: fields and gizmo

- Status: accepted
- Date: 2026-10-02
- Amended by: ADR 0039 (points 1, 3, 5, 6 and 7: where fields, toggles
  and steps live, scope of G and R, Escape)
- Depends on: ADR 0033 (assembly placement)
- Extends: ADR 0016 (millimetres and degrees in the viewer), ADR 0019
  (point 13: selection in 3D), ADR 0030 (contextual inspector)

## Context

ADR 0033 gives each assembly a placement in the frame of its anchor. The user
needs to set it in two ways: exactly, by typing values, and roughly, by
dragging in the 3D view.

Babylon.js provides position and rotation gizmos through `GizmoManager`;
`PositionGizmo.snapDistance` sets the drag step in Babylon units, 0 by
default (`@babylonjs/core` type declarations, read on 2026-10-02). A thread
on the Babylon.js forum reports that snapped rotations end with float noise
(values such as -6.09e-7 instead of 0), which the maintainers call expected;
`incrementalSnapping` is suggested there. The viewer pins `@babylonjs/core`
9.28.0; the float noise is NOT VERIFIED on that version, and point 5 makes
it harmless either way.

ADR 0016 point 5 already sets the pattern for a dragged value: the viewer
sends requests, one in flight, latest wins, and bodies move through the pose
stream, never by local computation.

The viewer has no undo history: an edit is undone by discarding the unsaved
changes of the Pantin (`packages/viewer/src/controller/drive-actions.ts`,
checked on 2026-10-02). Dragging therefore fills no history.

## Decision

1. **Fields.** When an assembly is selected, the inspector (ADR 0030) shows
   a "Placement" group: X, Y, Z in millimetres, RX, RY, RZ in degrees, and
   the anchor ("Repère : monde" or the anchor's name). Values are in the
   anchor frame. Editing a value sends `PUT .../placement` (ADR 0033
   point 8).
2. **Angles.** The document stores a quaternion. The viewer shows rotations
   about the fixed X, then Y, then Z axes of the anchor frame, recomputed
   from the quaternion after every change. This convention lives in one
   viewer module, next to the unit conversion of ADR 0016 point 4; changing
   it never touches the schema.
3. **Gizmo.** "Déplacer" and "Tourner" (toolbar and shortcuts) attach a
   Babylon.js position or rotation gizmo to the selected assembly. The
   gizmo's axes are the anchor's axes, shown at the assembly's current
   displayed pose.
4. **Dragging.** While dragging, only the gizmo follows the pointer. The
   viewer turns the gizmo's transform into a placement in the anchor frame
   (the inverse of the anchor's displayed pose, taken from the pose stream,
   composed with the gizmo's transform), rounds it to the step, and sends
   it as in ADR 0016 point 5: one request in flight, latest value wins.
   Bodies move through the pose stream. This frame change is display
   arithmetic at the viewer's frame boundary, like `frames.ts`, not
   simulation.
5. **Steps.** Translation step 1 mm and rotation step 15° by default,
   changeable in the viewer's settings (kept in the browser, never in the
   Pantin), and off while Ctrl is held. The viewer rounds the drag, not the
   resulting value: the displacement along the dragged arrow, or the angle
   about the dragged ring's axis, both in the anchor frame, and applies it to
   the placement the drag started from. The gizmo's float noise therefore
   never reaches the document, and a value typed off the grid survives a
   drag along another axis. (Amended on 2026-10-02 before the gizmo shipped:
   rounding the three angles of the result turned the part about the axes
   not dragged.)
6. **Scope.** Gizmo and fields act on assemblies only; a body selected by a
   double click (ADR 0019 point 13) shows its placement read only when it
   has one (ADR 0033 point 7).
7. **Escape** during a drag sends the placement the assembly had when the
   drag started.

## Rejected alternatives

- Moving the meshes locally during the drag and sending once on release:
  two sources of truth for the time of the drag, which ADR 0016 rejects for
  sliders.
- One request on release only: the bodies stay still while the gizmo moves,
  so the user cannot see contacts while placing.
- Gizmo axes in the world frame only: wrong for an assembly anchored to a
  turned body; a world toggle can come later if asked.
- Storing Euler angles in the document: gimbal lock and order ambiguity in
  a public schema.

## Consequences

- The viewer gains a gizmo layer and a placement group in the inspector,
  with labels in the typed catalogue (ADR 0016 point 3).
- Tests: typed values reach the document in SI and come back as typed; a
  drag sends rounded values; a placement under a parent turned by a revolute
  joint lands where the gizmo was released; Escape restores the start
  value.
- To measure: request rate while dragging on a Pantin of 50 assemblies.
