# 0055. Assemblies as rigid groups: joints target a group, grouping by hand

- Status: accepted (user, 2026-10-18)
- Date: 2026-10-18
- Amends: ADR 0011 point 3, ADR 0019 point 9, ADR 0033 points 2 to 4 and 7,
  ADR 0040 point 5, ADR 0041 point 2
- Supersedes: ADR 0017 points 1, 3 and 7, ADR 0040 point 3 (fixed joints at
  import)

## Context

Phase 8 asks for a part editor that chooses "which nodes become bodies"
(CLAUDE.md section 13); its exit criterion is a complete machine created
without editing a file by hand. On 2026-10-18 the user set the direction:

- a node "fait référence à la pièce qui agrège toutes les contraintes du
  groupe";
- no merging of bodies or files: joints target the group, and the bodies
  stay separate inside it;
- "On doit aussi introduire le découpage de l'assemblage en groupe, sauf si
  le STEP le permet dès le début. […] c'est un prérequis pour améliorer la
  création de nouveaux Pantins."

Facts checked in the repository on 2026-10-18:

- A joint links two bodies: `parent` and `child` are body ids
  (`joint-types/common.ts`). Schema version 12.
- A body without a parent joint never moves, even when its assembly's frame
  moves (`computeDisplacements`, `kinematics.ts`). This is why an import
  joins every body to a handle body with a fixed joint (ADR 0017, ADR 0040
  point 3). The bearings of `Translateur SCIE.step` carry 20 and 18 fixed
  joints each.
- An assembly is anchored by the one joint between assemblies whose child
  body it holds (`deriveAssemblyAnchors`). Its posed frame is
  `D(anchor child) ∘ W` (`computePosedAssemblyFrames`). Objects without a
  `body` follow that frame (ADR 0043).
- Joint origin and axis are in the frame of the parent body's assembly
  (ADR 0033 point 3). Tags are prefixed by the key of the child body's
  assembly (ADR 0040 point 5).
- Drives, actuators and joint sensors reference joints, never bodies.
- Existing routes: `POST .../assemblies` (create, optional `parent`),
  `PUT .../assemblies/:key/parent`, `PUT .../bodies/:bodyId/assembly` (keeps
  the pose, answers the renamed tags), deletion with a dry run (ADR 0037).
- There is no undo stack: an edit is undone by discarding the unsaved
  changes. The viewer selection holds one object.
- An import puts each GLB or STL file in its own assembly. A STEP file
  without sub-assemblies gives one assembly holding every leaf.
- `joint.parent` and `joint.child` are read in 31 files.

NOT VERIFIED:

- whether an existing Pantin has an unjointed body in an anchored assembly
  (point 9);
- whether ZW3D exports named sub-assemblies;
- the joint count of `Translateur SCIE.step` after this change (9 expected,
  one per child assembly).

## Vocabulary

- **Body**: one mesh file, never split or merged by Pantin.
- **Assembly**: a node of the structure tree (ADR 0040). It groups bodies
  and sub-assemblies and gives its key to the tags of the joints it holds.
- **Group**: an assembly used as the parent or the child of a joint. A
  group is one rigid piece: every body inside it that has no parent joint
  moves with it.

## Decision

1. **A joint endpoint is a body or an assembly.** `parent` and `child`
   become `{ kind: "body", id } | { kind: "assembly", key }`. Body ids and
   assembly keys are separate spaces, so the kind is explicit.

2. **A group is a kinematic link.**
   - `D(group) = D(parent link) ∘ M_world(q)`, the same formula as for a
     body.
   - A body without a parent joint follows its assembly: `D(body) =
     D(group)`, or the identity when no joint moves the group.
   - A body with a parent joint moves relative to that parent, as today.
   - No file is written. The pose formula `D ∘ W ∘ B` sent per body is
     unchanged.

3. **Where joints may go.**
   - Between two assemblies, the child must be a group. A body child is
     refused (`conflict`, with a message proposing its group).
   - Inside one assembly, the child is a body; its parent is a body of that
     assembly or the group itself (a ring turning in its bearing).
   - The parent of a joint between assemblies is a group or a body (a
     gripper group carried by a rod body).
   - Origin and axis are in the frame of the parent's assembly: the group
     itself, or the body's assembly.
   - Tags keep `<assemblyKey>.<tagKey>.*`, the key of the assembly the joint
     moves. For a group child that is the group's own key, so the prefix of
     every existing joint is unchanged.

4. **Tree validity** (protocol validator, pure).
   - At most one parent joint per body and per group. For a group, this is
     the anchor rule of ADR 0033 point 2, unchanged.
   - No cycle in the graph of links. In that graph, an unjointed body hangs
     from its group when the group is moved.
   - In particular, a joint whose child is group G cannot have as parent G
     or a body of G. The message names the joint.

5. **Nesting.** The structure tree (`parent`, ADR 0040) never carries
   motion, as before. A sub-group moves with its parent group through a
   joint.

6. **Grouper** (`POST .../assemblies/:assemblyKey/groups`).
   - Request `{ name, bodies: BodyId[], assemblies: Key[] }`: direct bodies
     and direct sub-groups of that assembly, A. Response 201 `{ pantin,
     group, deletedJoints, renamedTags }`.
   - One atomic command: everything is checked before anything changes.
   - The core creates the group G, child of A in the structure tree, with
     the identity placement (G's frame is A's frame), and one fixed joint
     A → G.
   - Sub-group members only change structure parent; their joints stay.
   - For each body member b:
     - no parent joint: b follows G, which is fixed to A, so nothing moves;
     - parent joint from another member: kept;
     - parent joint from a non-member rigid with A (A itself, or an
       unjointed body of A): a fixed joint is deleted, a moving one is
       re-pointed to parent G (same frame, origin and axis keep their
       numbers);
     - parent joint from a non-member that moves within A: refused, naming
       the joint and its parent, with "add it to the group";
     - a joint from b to a non-member body of A: refused, naming the child;
     - joints from b to groups elsewhere: kept.
   - Member bodies keep their placement: G has the identity placement, so
     a placement relative to A is the same relative to G. Objects attached
     to a member body move to G with the same placement.
   - Deleting a joint that a drive, an actuator, a sensor or a belt
     references is refused, naming the item.
   - Joints whose child body moved get the prefix of G: their tags are
     renamed and reported, as for `PUT .../bodies/:id/assembly`, and io.json
     follows.
   - Poses are unchanged at every joint position.

7. **Dégrouper** (`POST .../assemblies/:assemblyKey/ungroup`).
   - Response `{ pantin, deletedJoints, renamedTags }`. The core dissolves G
     into its structure parent A; a top-level group is refused.
   - Allowed only when G is rigid with A: its incoming joint is fixed and
     comes from A or from something rigid with A (that joint is deleted),
     or neither G nor A is moved by any joint. Otherwise refused, naming the
     joint that moves G, since its bodies would stop following it.
   - Bodies and objects of G move to A, their placements rewritten so that
     nothing moves (as in ADR 0033 point 7). Sub-groups get A as structure
     parent.
   - Joints whose parent is G are re-pointed to A, origin and axis rewritten
     into A's frame.
   - Tags of joints whose child body moved are renamed and reported. A tag
     key already used in A is refused with a free alternative.
   - Grouper then Dégrouper restores the document, apart from fixed joints
     that were deleted. Discarding the unsaved changes stays the general
     undo.

8. **One route per command.** The viewer does not compose existing calls:
   the checks of points 6 and 7 hold as a whole, and a failure in the middle
   would leave a half-made group. Moving one body or one group between
   groups stays available through the existing routes.

9. **Schema** 12 → 13. The migration:
   - writes every endpoint as `{ kind: "body", id }`;
   - rewrites the child of every joint between assemblies as its assembly.
     Poses and tag prefixes are the same;
   - keeps the internal fixed joints of existing Pantins valid.

   Behaviour change: an unjointed body of an anchored assembly now follows
   it. The migration lists those bodies in the console.

10. **Import.** No fixed joint inside an assembly: its bodies follow it. One
    fixed joint per child assembly, from the parent group to the child
    group. The anchor tree and the frames of ADR 0040 point 4 are unchanged.
    A bearing has 0 joints of its own and 1 to its parent. GLB, STL and
    single-part STEP files create no joint. `ImportBodiesResponse` keeps its
    shape.

11. **Other edits.**
    - Renaming an assembly key rewrites the endpoints that use it.
    - Deleting an assembly with its contents (ADR 0037) also deletes the
      joints on that group and its sub-groups.
    - Moving a body to another assembly deletes its fixed joints to the old
      assembly and lists them. A moving joint, or one that something
      references, is refused.
    - Face picks (ADR 0041): the request is unchanged; the result is in the
      frame of the parent group when the parent is a group.

12. **Viewer.**
    - Multi-selection in the tree only: Ctrl+click adds or removes a row,
      Shift+click selects a range, limited to body and group rows under the
      same assembly. The 3D view stays single selection; every other command
      acts on the first row.
    - "Grouper…" (asks for a name) and "Dégrouper", in the Édition menu and
      the tree context menu. The result message lists deleted joints and
      renamed tags.
    - The joint form offers groups and bodies (the core decides); group rows
      list their joints.

13. **Packages.** protocol: endpoint schema, rules, group and ungroup
    requests and responses. core: kinematics, anchors, migration, import,
    pure `domain/group-bodies.ts` and `domain/ungroup.ts`, routes. viewer:
    multi-selection, commands, forms. step-converter: no change.

14. **Documentation.** The user guide explains body, assembly and group as
    concepts, with the rule "a body with no parent joint moves with its group", before any procedure (CLAUDE.md section 5 is updated with this
    ADR).

## Rejected alternatives

- **Merging bodies or files** (an earlier draft of this ADR, with split and
  merge routes and bodies listing several mesh files): refused by the user
  on 2026-10-18; the group keeps the bodies separate.
- **A `rigid` flag on assemblies, endpoints staying bodies.** The joint
  would name an arbitrary body to move the group, and two joints into two
  bodies of one group would mean two parents for one link.
- **Keeping the star of fixed joints.** Noise in the tree, an arbitrary
  handle (ADR 0017), and no way to name a group as the target of a joint.
- **Unjointed bodies follow their assembly, endpoints staying bodies.** No
  schema change, but a joint would still target a body to move a group.
- **Grouping composed on the client** (create the assembly, move each body,
  fix the joints): not atomic, and a failure in the middle leaves a
  half-made group.
- **Grouping that re-points everything and never refuses.** It would
  silently change a pose when a member hangs from a moving non-member.
- **Multi-selection in 3D now.** Not needed to group, and it collides with
  the click-to-go-down navigation of ADR 0040 point 9.
- **Deriving motion from the structure tree.** It mixes product structure
  with kinematics, which ADR 0040 keeps apart.

## Consequences

- A STEP file without sub-assemblies becomes animatable with no file
  edited: select the rod's bodies, Grouper, turn the fixed joint A → G into
  a slider.
- New imports have far fewer joints; existing Pantins keep theirs.
- Grouping renames tags: the PLC side must regenerate its GVL. The result
  message says so.
- A frame and a rod inside a single GLB file stay one body: splitting a GLB
  by nodes is a later ADR (backlog `glb-split-by-nodes.md`).
- The endpoint change is mechanical but wide (31 files).
- To verify next: a re-import of `Translateur SCIE.step`, the migration on
  the user's Pantins, grouping on a real STEP file without sub-assemblies.

## Slices

1. protocol and core, the model: endpoints, rules, kinematics, anchors,
   `migrateV12ToV13`; poses bit for bit equal before and after the
   migration, at rest and at q ≠ 0.
2. core, Grouper and Dégrouper (the prerequisite), with the exit-criterion
   scenario over HTTP: import a one-level STEP fixture, group the moving
   bodies, turn A → G into a slider, add a drive and an actuator, write the
   tag, step the clock; G's bodies move, A's do not; save, reopen.
3. core, the import of point 10 and the edits of point 11.
4. viewer: tree multi-selection, Grouper and Dégrouper, joint form
   endpoints, group rows.
5. doc-writer (concepts first, French and English), then the reviewer.

## Amendment (2026-10-18): precisions found while implementing slice 2

- "Rigid with A" (points 6 and 7) also covers a body linked to A through a
  chain of fixed joints that ends at an unjointed body of A: its pose is
  identical to A's at every joint position.
- Grouper then Dégrouper: a moving joint that hung from a rigid body of A
  and was re-pointed to G comes back with group A as parent, not the
  original body. The pose is the same; the document differs in that parent
  and in the deleted fixed joints.

## Amendment (2026-10-18): moving a body between groups (slice 3)

Point 11, moving a body to another assembly: a constant placement cannot
keep the pose of a body at every joint position when its old and new groups
are moved by different joints. The move is therefore allowed only when the
body, its old group and its new group are moved by the same joint, or by
none; otherwise it is refused (`conflict`), naming the joint, and the user
moves the whole group or uses Grouper. The fixed joints that join the body
to the old assembly, as parent or as child, are deleted and listed in the
response (`MoveBodyResponse` = renamed tags plus `deletedJoints`).

Checked with the real converter on 2026-10-18: `Translateur SCIE.step`
imports as 51 bodies, 10 assemblies and 9 fixed joints, all between groups.
