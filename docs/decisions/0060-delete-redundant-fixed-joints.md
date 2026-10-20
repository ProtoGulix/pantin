# 0060. Delete the fixed joints made redundant by groups

- Status: accepted (user, 2026-10-20)
- Date: 2026-10-20
- Extends: ADR 0055 (groups), ADR 0038 (preview then exact-list cleanup)
- Closes: backlog `remove-redundant-fixed-joints.md`

## Context

Since ADR 0055 a body with no parent joint follows its group, so the fixed
joints that ADR 0017 and ADR 0040 point 3 created inside an assembly are
redundant. The v12 to v13 migration keeps them valid, so existing Pantins
still carry them. Some may be placeholders the user means to turn into
sliders (ADR 0017 point 6): they are never deleted without a preview.

Facts checked in the repository on 2026-10-20:

- `computeDisplacements` (`packages/core/src/domain/kinematics.ts`): a link
  with a parent joint gets `D(parent) ∘ worldMotion(M(q), W(parent's
  assembly))`; a body without one gets `D(group of its assembly)`; a group
  without one gets the identity.
- A fixed joint's motion is the identity whatever its origin
  (`joint-types/fixed.ts`). The pose sent per body is `D ∘ W(assembly) ∘ B`,
  where `B` is `body.placement`, stored on the body. A fixed joint's origin
  and axis therefore never affect a pose.
- An anchor exists only for a joint whose endpoints are in different
  assemblies (`assembly-anchors.ts`). A joint inside one assembly changes no
  `W`.
- The protocol refuses a body child whose parent is in another assembly
  (`pantin-joint-tree.ts`). Inside one assembly, the child is a body and the
  parent is a body of that assembly or the group itself (ADR 0055 point 3).
- `isRigidWithAssembly` (`domain/group-shared.ts`) already decides "rigid with
  A": the group itself, or a body whose parent chain is made of fixed joints
  only.
- What references a joint: `actuator.joints`, `sensor.joint` and
  `belt.drumJoint`, and the protocol refuses a fixed joint for all three.
  Drives reference no joint. The runtime state (positions, setpoints, jammed
  fault) is cleared by `forgetJointRuntimeState`.
- Fixed joints carry no tag (`tag-entries.ts`), so io.json is not affected.
- There is no undo stack: an edit is undone by discarding the unsaved
  changes.

## Decision

1. **Candidates.** A fixed joint J whose parent P and child C are in the same
   assembly A. C is then a body of A. A fixed joint between two assemblies is
   never a candidate and never listed: it anchors its child group, so
   deleting it would change `W` of that group and the motion of its whole
   subtree. The import and Grouper create those on purpose (ADR 0055
   points 6 and 10).

2. **Redundancy criterion**, structural and exact for every joint value.
   With J, `D(C) = D(P)`; without J, `D(C) = D(group A)`, or the identity
   when no joint moves A (an assembly that is not a group follows the same
   rule). J is redundant if and only if `isRigidWithAssembly(document, P, A)`:
   P is group A, or P is a body of A whose parent chain is fixed joints only.
   - The rest pose does not change: `B` stays on C, `W(A)` is unchanged and
     the fixed origin was never used.
   - C's subtree is unchanged: C keeps its motion, its assembly and its child
     joints.
   - The criterion is conservative: a chain through any moving joint keeps J,
     even when that joint is jammed or has degenerate limits.
   - Any subset of the redundant set can be deleted together.
   - The structure tree (`parent`, ADR 0040) plays no part.

3. **Kept, with a reason.** Each non-redundant candidate is listed with
   `moving_parent`, naming the nearest moving joint up P's chain, or
   `in_use`, naming the actuator, sensor or belt. The latter cannot happen
   in a document the protocol accepts today; it is a guard.

4. **API** (`packages/protocol/src/redundant-joints-api.ts`).
   - `GET /api/pantins/:pantinId/redundant-joints` returns
     `{ redundant: ListedJoint[], kept: KeptJoint[] }`, with
     `ListedJoint = { id, name, assembly: { key, name } }` and
     `KeptJoint = ListedJoint & { reason, by: { kind, id, name } }`, both
     sorted by assembly name then joint name. It changes nothing.
   - `POST /api/pantins/:pantinId/redundant-joints/delete` takes
     `{ jointIds }` (1 to 1000) and returns
     `{ pantin, deletedJoints, skipped }`. The core recomputes the criterion
     and deletes only the ids both requested and still redundant; the others
     go to `skipped`, as in ADR 0038 point 3. One document replacement,
     validated before it is committed, so all or nothing; one unsaved change
     that "Ne pas enregistrer" discards. `forgetJointRuntimeState` runs for
     each deleted id.
   - The routes live outside `.../joints/` because `DELETE
     .../joints/:jointId` would match a joint whose id is `redundant`.
   - **No schema change.** `pantin.json` only loses array entries: its shape
     and meaning are unchanged, so `schema_version` stays 13.

5. **Viewer.**
   - "Édition > Supprimer les liaisons fixes redondantes…" after
     "Dégrouper", and the same entry in the context menu of the Pantin row.
     It acts on the whole Pantin, not on the selection.
   - With nothing to delete, the message "Aucune liaison fixe redondante."
     and no prompt.
   - The prompt follows the assembly deletion prompt of ADR 0037: "Supprimer
     {count} liaison(s) fixe(s) redondante(s) ? Les corps suivent déjà leur
     groupe : rien ne bouge.", then two sections with a text heading and a
     count, "À supprimer" grouped by assembly and "Conservées" with one
     reason line per joint. Colour is never the only cue (ADR 0057).
   - Confirm sends exactly the previewed ids. The result message lists the
     deleted joints, the skipped count if any, and recalls that "Ne pas
     enregistrer" undoes it.
   - The viewer computes nothing: the criterion is core logic.

6. **Packages.** protocol: the schemas. core: pure
   `domain/redundant-joints.ts` (`findRedundantFixedJoints`,
   `deleteRedundantFixedJoints`), a service and the routes. viewer: menu
   entries, prompt, strings. bridge, cli, step-converter: no change.

7. **Tests.** Pure domain first: classification (stars, parent is the group,
   chains, kept under a slider, between groups, assembly that is not a group,
   non-identity origin and placement), pose invariance before and after at
   rest and with every movable joint moved, the `in_use` guard. Then HTTP
   (preview changes nothing, exact intersection, `skipped`, unsaved flag,
   runtime state cleared) and the viewer prompt model.

8. **Documentation.** The groups guide page gets a section on cleaning old
   fixed joints, the menus reference gets the entry (fr and en), the
   CHANGELOG, and the backlog note is deleted.

## Rejected alternatives

- **Automatic deletion in a migration (13 to 14).** Bumps the schema with no
  shape change, edits the user's files silently, and deletes fixed joints
  kept on purpose as future sliders.
- **Deletes composed by the client.** Not atomic, and the viewer would need
  the criterion, which is simulation logic (CLAUDE.md principle 2).
- **Including fixed joints between assemblies.** Changes anchors and frames,
  undoes the import tree of ADR 0055 point 10.
- **Deleting "whatever is redundant now" with no id list.** The core could
  delete another set than the one confirmed (ADR 0038).
- **Refusing the whole request when one id is no longer redundant.** Safe,
  but the user starts over; intersect and report is what ADR 0038 does.
- **A numerical criterion** (compare poses at sampled positions). Not exact,
  and slower.
- **Scope per assembly.** Not needed now; an optional field can come later.

## Consequences

- Existing Pantins drop their import stars in one confirmed step, with no
  tag renamed and no GVL to regenerate.
- The command cannot delete a joint whose loss would move anything, and the
  pose tests check it.
- NOT VERIFIED: whether poses stay bit for bit identical (the old path
  applied `W ∘ I ∘ W⁻¹`, which may round; tests use a tolerance), and how
  many redundant joints the user's real Pantins hold.
