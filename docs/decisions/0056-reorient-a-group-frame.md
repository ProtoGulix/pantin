# 0056. Reorient an assembly's frame without moving anything

- Status: accepted (user, 2026-10-18)
- Date: 2026-10-18
- Extends: ADR 0033 (placements, joint frames, edits keep the world pose),
  ADR 0040 point 4 (each assembly keeps its CAD frame), ADR 0042 (frame
  drawn, local gizmo), ADR 0055 point 3 (frame of a joint)

## Context

On the user's machine (2026-10-18) a carriage group G slides on rails
inclined at 70°. Its frame comes from the CAD and is not inclined, so its
slider reads an axis such as [0.94, 0, 0.34], and the local gizmo (ADR 0042
point 2) does not drag along the rails. The only frame edit today,
`PUT .../assemblies/:key/placement` (ADR 0033 point 8), moves the assembly.
The user asked to "réorienter le repère de groupe" without moving any body.

Facts checked in the code on 2026-10-18:

- A joint's origin and axis are read in the frame of its PARENT's assembly:
  `computeDisplacements` composes `worldMotion(motion, W(parent assembly))`
  (kinematics.ts); `jointAxisOfFace` answers in that frame
  (joint-axis-from-face.ts); the viewer draws that frame for a selected
  joint (`assemblyFrameTargetOf`, assembly-frame.ts). The slider moving G,
  of parent P, therefore reads its numbers in P's frame: reorienting G alone
  never changes them.
- G's own frame is what the local gizmo, G's trihedron, the joints G
  parents and the objects framed in G use.
- W(X) = W(anchor) ∘ placement(X), the anchor being derived from joints; the
  structure parent plays no part (`computeWorldPlacements`). A body's pose is
  D ∘ W ∘ B. An object without `body` is placed relative to the posed
  assembly frame, with `body` relative to the body pose
  (framed-world-pose.ts). Drives, actuators and sensors carry no geometry.
- Joint limits, joint sensor ranges and positions are scalars along the
  axis.
- On the user's machine the carriage's joint (still fixed) has the top
  assembly as parent, which also parents the cylinder group.

## Decision

1. **The frame change.** Reframing assembly X by a rotation R (new frame
   F' = F ∘ R, R expressed in the old frame, origin kept) rewrites, in one
   atomic edit:
   - X's placement: p ∘ R (in its anchor's frame, world-anchored included);
   - every body of X: B' = R⁻¹ ∘ B;
   - every joint whose parent is X or a body of X (internal joints
     included): origin and axis multiplied by R⁻¹;
   - every assembly anchored to X: p' = R⁻¹ ∘ p;
   - every belt, guide, emitter, absorber and presence sensor of X without
     `body`: placement' = R⁻¹ ∘ placement; with `body`: unchanged.

   Left unchanged: the joint whose child is X (read in its parent's frame),
   joints parented outside X, structure-only children (placed relative to
   their anchor), limits, sensors, drives, actuators, tags, io.json, face
   files, runtime state (positions, setpoints, drive states, products,
   ADR 0033 point 9). No displacement changes, so every pose and posed frame
   is unchanged at every joint position, to rounding. Axis components within
   1e-9 of 0, 1 or -1 are snapped (ADR 0041 point 4).

2. **One command aligns both frames on a joint's axis.** For a saved,
   non-fixed joint J: the core takes J's axis as a physical direction at the
   reference configuration and computes, for each frame to change, the
   smallest rotation that brings that frame's Z onto it (a turn about
   Z × axis, or 180° about X when they are opposite). It reframes:
   - the assembly of J's parent, so that J reads exactly [0, 0, 1];
   - and, when J's child is a group, that group, so that its local gizmo
     and trihedron follow the motion. G's rotation relative to its parent is
     then unchanged and its placement fields read the travel along Z.

   When J's child is a body, only the parent's assembly is reframed (the
   body lives in it). A frame already aligned is left as is.

3. **API.** `POST .../joints/:jointId/align-frames`, no body. Response
   `{ pantin, reframedAssemblies: Key[], rewrittenJoints: { id, name }[] }`:
   the joints whose numbers changed, so that side effects on a large parent
   are visible. Refusals: unknown joint 404; fixed joint 409 ("a fixed joint
   has no axis to align with"). An unsaved document change, as any edit. No
   document schema change: every field written exists since schema 10.
   protocol gains the response schema and the route comment only.

4. **Packages.** protocol: response schema, route comment. core: pure
   `domain/reframe-assembly.ts` (the frame change by R, reusing
   `mapFramedItems`) and `domain/align-frames.ts` (rotations from a joint
   axis), the route. viewer: one command, no geometry; the trihedron and the
   gizmo read pose ∘ B⁻¹ and follow the new placements unchanged.
   step-converter, bridge: none.

5. **Viewer.** In the inspector of a saved, non-fixed joint: "Aligner le
   repère sur cet axe". Disabled while the joint form has unsaved changes,
   since the core uses the stored axis. The result line names the reframed
   assemblies and lists the rewritten joints. With ADR 0041: turn the joint
   into a slider, pick its axis on a face, save, then align. No new pick
   mode.

6. **Documentation.** The user guide (fr, en) explains first that a joint's
   axis is read in the frame of its parent's assembly, then the command. The
   "Préparer ses modèles 3D" guide keeps the advice to align moving
   sub-assemblies in the CAD software, which avoids the command.

## Rejected alternatives

- **Reframe the moving group only** (the literal request): fixes the gizmo,
  not the slider's numbers, which are in the parent's frame.
- **Two separate commands, parent and group**: more control, but the user's
  case always needs both; one command was chosen by the user.
- **Read a joint's axis in its child group's frame**: one reframe would fix
  both needs, but it contradicts ADR 0033 point 3 and ADR 0055 point 3, needs
  a migration of every joint between assemblies and changes what ADR 0041
  and 0042 show.
- **A frame per joint** (URDF style rotation on the joint): schema change on
  every joint, and the group's gizmo stays crooked.
- **Composed on the client** (placement plus per-body edits): not atomic, no
  route sets body placements, and the viewer would compute geometry
  (CLAUDE.md section 3.2).
- **Reuse `keepDisplayedPose`**: it solves on a key body and may shift other
  bodies; a frame change is exact and needs no solving.
- **Move the origin to the joint origin now**: rewrites every number of the
  assembly for little gain.

## Consequences

- The user's case: slider, axis picked on a face, save, one click. The
  slider reads [0, 0, 1] and the carriage's local gizmo drags along the
  rails.
- Reframing a large parent rewrites all its other joints' numbers (listed in
  the answer); on the user's machine the cylinder's joint, parented by the
  same top assembly, is rewritten too. Grouping the rails first (ADR 0055
  point 6) gives a small parent instead.
- No undo besides discarding the unsaved changes.
- Poses after the edit equal the previous ones to rounding, not bit for bit;
  determinism after the edit is unaffected (ADR 0005).
- Tests (core, pure): a fixture with a parent tilted 70°, a slider parent →
  G, a pivot parented in G, a sub-assembly anchored to G, a belt framed in G
  without body, a presence sensor on a body of G. After the command the
  slider axis is exactly [0, 0, 1] and G's posed Z equals the rails'
  direction; body poses, posed frames and framed object poses equal within
  1e-12 at q = 0, at slider q ≠ 0 and at pivot q = 1 rad; limits and sensors
  unchanged; refusals covered; HTTP test: unsaved change, positions kept.

## Backlog

Other ways to give the rotation: numeric, a picked face (cylinder axis or
plane normal), X or Y instead of Z, origin moved to the joint origin or the
picked point; a "Réorienter le repère…" entry in the group's context menu.
