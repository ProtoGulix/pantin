# Place phase 6 objects from a picked face

Phase: 8. ADR: 0043 point 1, 0035.

The frame convention of ADR 0043 point 1 (Z out of the supporting face,
origin at the bottom face centre) matches a frame taken from a picked face
(ADR 0035), but the forms ask for numbers. A pick tool in the object form
would put a belt or a cell on a face in one click.

## Why it is parked

Not a viewer-only job. The placement of an object is relative to a body frame
or to the assembly frame as currently posed (ADR 0043 point 1), and the face
geometry (centre of the face, outward normal in the body's own frame and unit)
is the core's: the viewer only knows the clicked point and triangle normal in
world space, and turning those into a body-relative placement would put
kinematics in the viewer. It needs a core route like the joint one of ADR 0041
(for example "placement-from-face": body id and face index in, a `Placement`
out), with its own protocol schema; then the form gets a pick button like the
joint form's "Prendre l'axe sur une face".
