# 0041. Joint axis from a picked face

- Status: accepted (user, 2026-10-05)
- Date: 2026-10-05
- Extends: ADR 0035 (face files and picking), ADR 0040 point 4 (assembly
  frames), ADR 0033 point 3 (joint frames)

## Context

Since ADR 0040 point 4, a joint's origin and axis are read in the frame of
its parent body's assembly, which is the frame the CAD gives that
sub-assembly. A joint created at import still has origin [0, 0, 0] and
axis [0, 0, 1]. Turning it into a slider or a pivot means typing an axis
the user must find: on `Translateur SCIE.step` the rod of cylinder
`ID1S0400125E_0:1` slides along [-1, 0, 0] of the cylinder frame, which
the main agent found by reading mesh extents, not something a user can do.

The geometry is already there. The converter writes a face file per STEP
body (ADR 0035 point 2): for a cylindrical face, a point on its axis, the
axis direction (sign arbitrary) and the radius; for a plane, a point and
the outward normal. The viewer maps a 3D pick to a face (ADR 0035
point 3), and the core turns a picked face into a frame (an origin and a
Z direction, ADR 0035 point 4) for the alignment.

Facts checked in the repository on 2026-10-05:

- Face geometry is in the frame where the mesh file places the body; the
  core composes it with the body placement (ADR 0035 point 2), which
  ADR 0040 point 4 now sets on every STEP body.
- `PATCH .../joints/:jointId` replaces the whole joint and keeps its id,
  so its tags (ADR 0018 point 6).
- STL and GLB bodies have no face file; a pick then only gives a plane
  from the triangle normal (ADR 0035 point 3).

## Decision

1. **"Prendre l'axe sur une face".** The joint form (slider, limited
   pivot, continuous pivot, helical) gets a button next to the axis
   fields. Pressing it waits for one pick in the 3D view, like an
   alignment pick (same highlight, Escape cancels, ADR 0039 point 6).
   - Cylindrical face (a shaft, a rod, a bore): origin on the axis, at the
     hit point projected on it; axis along the cylinder axis.
   - Plane: origin at the hit point; axis along the outward normal (a
     slider moving away from that face, a pivot turning about it).
   - Face of kind other, or a body without face file: refused with the
     reason on the panel's message line, nothing changes;
     the pick keeps waiting for another face or Escape.
   Any body can be picked, not only the joint's own bodies: the axis of a
   bore in the frame can drive the rod.
2. **Computed by the core.** New route
   `POST .../joints/:jointId/axis-from-face` with `{ bodyId, faceIndex,
   hitPoint }` (hit point in metres in the Pantin frame as displayed, as
   for the alignment). The core takes the face frame to the Pantin frame
   with the body's current pose, then to the frame of the joint's parent
   body's assembly (ADR 0033 point 3), and answers the origin and the
   axis. It does not store them: the form shows them in its fields, the
   user can still edit them, and the form's usual save sends the joint.
   The viewer computes no geometry (CLAUDE.md section 3.2).
3. **Direction.** A cylinder axis has no meaningful sign. The form gets an
   "Inverser l'axe" button, which negates the three fields. The slider
   preview (ADR 0018) shows which way the joint moves before saving.
4. **Rounding.** Components closer than 1e-9 to 0, 1 or -1 are snapped to
   them, so an axis that is exactly a frame axis reads [-1, 0, 0], not
   [-0.9999999999, 1e-12, 0].
5. **No schema change.** Joints keep `origin` and `axis`; the protocol
   gains the request and response schemas of the route.

## Rejected alternatives

- **Guess the axis at import** (largest cylinder of the child body):
  wrong as often as right. A rod has a cylinder along its stroke, but so
  do its bolts and its clevis pin, and a pivot's useful cylinder belongs
  to the parent as often as the child. The user's click says which.
- **Compute the axis in the viewer** from the face file: the viewer would
  need the body poses and the frame composition of ADR 0033, which is
  core logic.
- **Store the axis at pick time** (route writes the joint): the user
  could not check the direction or adjust before saving, and an edit
  would bypass the form.

## Consequences

- Setting a slider on a rod or a pivot on a shaft is: edit the joint,
  choose the type, "Prendre l'axe sur une face", click the rod, check the
  preview, invert if needed, save.
- Bodies imported before ADR 0035 (no face file) can only take a plane
  normal from the picked triangle; for them a reimport gives face files.
- Slices: K1 core route and protocol (frame composition tested on a
  rotated sub-assembly: a cylinder along the cylinder's X gives [±1, 0, 0]
  in its assembly frame); K2 viewer (button, pick mode, Inverser, rounding
  shown). Exit criterion: on "scie", the rod joint of `ID1S0400125E_0:1`
  gets axis [-1, 0, 0] or [1, 0, 0] from a click on the rod, and the
  slider preview moves the rod along the cylinder.
