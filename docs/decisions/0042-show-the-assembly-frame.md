# 0042. Show the assembly's own frame, and a local gizmo

- Status: accepted (user, 2026-10-05)
- Date: 2026-10-05
- Amends: ADR 0034 point 3 (gizmo axes)
- Extends: ADR 0040 point 4 (assembly frames), ADR 0033 point 3 (joint
  frames)

## Context

Since ADR 0040 point 4 (revised), every imported assembly keeps the frame
its CAD file gives it, and a joint's origin and axis are read in the frame
of its parent body's assembly. The 3D view never shows that frame:

- the placement gizmo shows the axes of the assembly's anchor
  (ADR 0034 point 3), because the X…RZ fields are stored relative to the
  anchor (ADR 0033 point 1);
- the joint arrow shows the axis direction, not the frame it is read in.

Reported by the user on 2026-10-05: in `Translateur SCIE`, the cylinder
`ID1S0400125E_0:1` is tilted 70°, its anchor is the translator, so the
gizmo's trihedron stands upright on a tilted cylinder. The rod slider's
axis [-1, 0, 0] is along the cylinder, which nothing on screen explains.
Before the revision the two frames were the same, so the question did not
arise.

## Decision

1. **The assembly frame is drawn.** When an assembly is selected, and
   while a joint or its form is selected, the 3D view draws a trihedron at
   the origin of the relevant assembly's frame: X red, Y green, Z blue,
   each tip labelled X, Y, Z, with a constant on-screen size. For a joint,
   the relevant assembly is its parent body's, the frame its axis is read
   in. The trihedron follows the displayed poses (it is the world frame of
   the assembly, ADR 0033 point 4), so it moves with the assembly.
2. **Gizmo: "Local" by default, "Global" on demand.** The tool bar gets a
   toggle next to Déplacer/Tourner (key L, ignored while typing).
   - Local: the gizmo's axes are the assembly's own frame, the trihedron
     of point 1. Dragging along its X moves the cylinder along itself.
   - Global: the anchor's axes, as ADR 0034 point 3 did.
   The choice is a viewer preference kept in browser storage. The viewer
   still turns the gizmo's transform into a placement in the anchor frame
   before sending (ADR 0034 point 4); only the axes offered change.
3. **The fields say their frame.** The six fields stay in the anchor frame
   (stored data, unchanged). Their group title reads "Position dans
   « {anchor} »" ("dans le monde" when world-anchored). The joint form's
   axis and origin fields read "Axe (repère de « {assembly} »)" and
   "Origine (repère de « {assembly} »)".
4. **Viewer only.** No core, protocol or schema change. Frames come from
   the pose stream and the document as today; drawing them is display
   arithmetic at the viewer's frame boundary (CLAUDE.md section 3.2).

## Rejected alternatives

- **Store the fields in the assembly's own frame**: meaningless, the
  placement is the relation between the assembly frame and its anchor.
- **Gizmo always local, no toggle**: placing an assembly along the
  machine's axes (the global case) is as common as moving it along itself.
- **Draw every assembly's trihedron all the time**: on Translateur SCIE
  that is ten trihedra overlapping the meshes; only the selection's frame
  helps.

## Consequences

- Reading a joint becomes: select it, its assembly's trihedron appears, its
  axis [-1, 0, 0] visibly points along the red X, reversed.
- ADR 0039's tool bar gains one toggle; ADR 0036's key list gains L.
- Slices: L1 trihedron for the selected assembly and joint (pure frame
  from poses, tested; Babylon drawing thin); L2 local/global gizmo, key L,
  stored preference; L3 field titles and joint form labels (fr, en).
  Exit criterion: on "scie", selecting the cylinder shows a trihedron
  tilted 70° with X along the cylinder; with the local gizmo, dragging X
  moves it along itself; selecting the rod joint shows the same trihedron
  and an arrow along -X.
