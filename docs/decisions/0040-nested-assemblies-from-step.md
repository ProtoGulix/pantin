# 0040. Nested assemblies that follow the STEP tree

- Status: accepted
- Date: 2026-10-04
- Supersedes: ADR 0017 point 1 (one flat star per import), ADR 0019
  points 3 and 11 (one assembly per import, flat assemblies)
- Amends: ADR 0037 point 1 (deletion with contents)
- Extends: ADR 0033 (assembly placement and anchors)

## Context

The goal is that a user imports a whole machine from their CAD and gets a
usable structure without heavy rework. Today a STEP import loses the
structure the designer built:

- The converter walks the tree and keeps only the leaves (assembly.py,
  `find_leaf_components`). Each leaf keeps its node chain in
  `source.nodes`, but nothing else uses it.
- The core puts every body of the import in one assembly (ADR 0019
  point 3) and joins every body to the first one with a fixed joint
  (ADR 0017 point 1). Assemblies are flat (ADR 0019 point 11).

ADR 0017 had deferred "one star per sub assembly" until a real nested file
had been imported. That file now exists: `private/Translateur SCIE.step`
(Autodesk Translation Framework v15.8, AP214). Read with the project
converter on 2026-10-04, it gives 72 leaves under one root, with leaves
down to depth 4:

    Translateur SCIE                         72 parts
      Chariot SCIE:1                         part
      michaud_chailly_B9-GHBR-20-PP:1, :2    parts
      chariot Scie plaque (Assemblage):1     66 parts, 9 of them direct
        michaud_chailly_6208-2RS1:1          20 parts (bearing)
        michaud_chailly_6308-2RS1:1          18 parts (bearing)
        michaud_chailly_A9-23L100F:1         3 parts
        michaud_chailly_B7-BAA-20:2 to :5    4 parts each
      ID1S0400125E_0:1                       3 parts (cylinder)

Imported today, this machine becomes one assembly of 72 bodies, all fixed
to `Chariot SCIE`. Splitting it by hand means creating assemblies, moving
bodies one by one, and re-parenting joints first, since an assembly may
have only one incoming joint between assemblies (ADR 0033 point 2). For
the carriage that is 66 moves. NOT VERIFIED: the exact refusal on the
second move; the anchor rule makes it expected.

Facts checked in the repository on 2026-10-04:

- `pantin.json` is at schema_version 10 (pantin.ts).
- An assembly's frame is the frame of the files it was imported from, and
  the converter writes every GLB in the frame of the STEP root (ADR 0033
  point 1). Identity placements therefore reproduce the CAD layout.
- Tag names are `<assemblyKey>.<tagKey>.*`, and assembly keys are unique
  per Pantin (ADR 0019 points 1 and 6).
- `ImportBodiesResponseSchema` is `{ bodies, joints }` (api.ts).

NOT VERIFIED: that ZW3D exports named sub-assemblies the same way. The
user's earlier files (cylinder, gripper) had a single level.

## Decision

1. **Structure tree.** An assembly gets an optional `parent`: the key of
   the assembly that contains it. No parent means top level. The parent
   tree is product structure only. It never enters pose computation, and
   it is independent of the anchors of ADR 0033, which stay derived from
   the joints. Parents cannot form a loop, and the schema checks that the
   key exists.

2. **Import follows the tree.** Every STEP node that is an assembly
   becomes a Pantin assembly, at every depth, named after the node's name
   as the converter reads it (instance name first). Every leaf becomes a
   body in the assembly of its direct parent node. An import always
   yields exactly one top-level assembly:
   - a file with one root: that root;
   - a file with several roots: an assembly named after the file, with
     the roots as children;
   - a single-part STEP, GLB or STL: one assembly, as today.

3. **Fixed joints per assembly.** Each assembly has a handle body: its
   first direct body, or else the handle of its first child assembly that
   has one. Inside an assembly, every other direct body is the child of a
   fixed joint whose parent is the handle. Each child assembly whose
   handle is not its parent's handle is joined by one fixed joint from
   the parent's handle to its own handle. Every assembly therefore has at
   most one incoming joint between assemblies, and the anchors form a
   forest (ADR 0033 point 2). At import, the anchor tree is the STEP tree.
   Joints are still created through `addJointToDocument` (ADR 0017
   point 2).

4. **Placement.** Every created assembly gets the identity placement.
   The GLB files are already in the frame of the STEP root, so nothing
   moves compared to the CAD. Using STEP instance locations as assembly
   placements is not needed for this and goes to the backlog
   (docs/backlog/nested-assemblies-extras.md).

5. **Keys and tags.** Each assembly key is derived from its name and made
   unique per Pantin, as today. Tags keep the form
   `<assemblyKey>.<tagKey>.*`: the key of the child body's own assembly,
   not a path. Nesting therefore never lengthens a tag, and moving an
   assembly in the tree never renames one.

6. **Import response and rollback.** `ImportBodiesResponseSchema` becomes
   `{ assemblies, bodies, joints }`, where `assemblies` lists the
   assemblies created, top level first. The rollback removes, in order,
   the joints, the bodies, then the assemblies, deepest first.

7. **Editing the tree.**
   - `POST .../assemblies` accepts an optional `parent`.
   - `PUT .../assemblies/:assemblyKey/parent` with `{ parent: key | null }`
     moves an assembly in the tree. A loop is refused (`conflict`) with a
     message naming the assembly that would contain itself. Nothing moves
     on screen and no tag changes.
   - An assembly that contains sub-assemblies is not empty in the sense
     of ADR 0019 point 10.

8. **Deletion.** Deleting an assembly with its contents (ADR 0037) also
   deletes its descendant assemblies and their contents. The preview
   lists them. The other rules of ADR 0037 apply to the whole subtree
   taken as one assembly.

9. **Viewer.**
   - The tree nests assemblies under their parent, then bodies and
     internal joints. The folder of joints between assemblies is
     unchanged.
   - In 3D, a first click selects the top-level assembly of the picked
     body. Each double click goes one level down, until the body, as in
     CAD tools.
   - Hiding or isolating an assembly applies to its whole subtree.

10. **Schema.** schema_version 10 to 11. Migration: no assembly gets a
    parent, so every existing Pantin keeps its flat structure. The
    validator (ADR 0021) reports parent loops and unknown parents.

## Rejected alternatives

- **Derive nesting from the anchors**, with no new field: no schema
  change and a single tree. Rejected because a STEP node that holds only
  sub-assemblies (a common top-level case) has no body, so no joint can
  anchor anything to it, and it would vanish from the tree. It also mixes
  product structure with kinematics, which ADR 0019 keeps apart.
- **Split only at the first level of the tree**: smaller change, but it
  does not respect the tree, and the cylinder or bearings nested deeper
  stay mixed with their parent.
- **Import option to flatten**: keeps today's behaviour for those who
  want it. Not needed now. A user who wants a flat machine can move a
  few assemblies in the tree. To be reconsidered if deep trees of
  bought parts (bearings, screws) prove to be noise in practice.
- **Tags with the full path** (`translateur.chariot.cylinder.rod.position`):
  readable, but long, and any change of the tree would rename tags in
  the PLC program.

## Consequences

- A whole machine imports with its sub-assemblies ready to be animated:
  turning the joint above `ID1S0400125E_0:1` or above the carriage into a
  slider is one change per moving part, with no body moved by hand.
- Small bought parts (bearings, here 20 and 18 bodies) become assemblies
  of their own. Collapsing a sub-assembly into a single rigid body is a
  separate need, recorded in docs/backlog/nested-assemblies-extras.md.
- Two independent trees exist: structure (`parent`) and anchors
  (joints). They match after import and may differ after edits. The
  inspector shows both, so the user can tell them apart.
- Public changes approved by the user on 2026-10-04: the document schema
  (`parent`, version 11), the import response, `POST .../assemblies` and a
  new route.
- To verify next: import `Translateur SCIE.step` end to end (72 bodies,
  10 assemblies expected); one ZW3D file with sub-assemblies; time of an
  import of a few hundred bodies, since each joint creation validates the
  whole document (ADR 0017 consequences).
