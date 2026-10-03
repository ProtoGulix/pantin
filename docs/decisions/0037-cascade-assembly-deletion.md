# 0037. Deleting an assembly with its contents

- Status: accepted
- Date: 2026-10-03
- Amends: ADR 0019 (point 10: deleting a non-empty assembly)
- Depends on: ADR 0033 (anchors, edits keep the world pose), ADR 0028
  (actuators, feeds), ADR 0023 (sensors watch joints), ADR 0035 (face
  files are deleted with their mesh)

## Context

On 2026-10-03 the user imported `ID1S0400125E_0.stp`. As ADR 0017 and
ADR 0019 point 3 require, the import created one assembly with 3 bodies
and 2 fixed joints between them. Removing that import takes six requests
in a set order: 2 joint deletions, 3 body deletions, then 1 assembly
deletion. The refusals do not say what that order is:

- `deleteAssembly` refuses an assembly that still holds a body, a drive,
  an actuator or a sensor (`packages/core/src/domain/assembly-edits.ts`,
  `deleteAssembly`). Its message says "Move or delete them first" and
  never mentions joints.
- `deleteBody` refuses a body that any joint uses
  (`packages/core/src/service/mesh-lifecycle.ts`, `deleteBody`).
- `deleteJointFromDocument` refuses a joint that an actuator moves or a
  sensor watches (`packages/core/src/domain/joint-rules.ts`).
- `deleteDriveFromDocument` refuses a drive that feeds an actuator
  (`packages/core/src/domain/drive-rules.ts`).
- The viewer sends an assembly deletion without asking first, because
  "only an empty assembly can be deleted"
  (`packages/viewer/src/controller/session-actions.ts`, `requestDelete`).

On 2026-10-03 the user approved amending ADR 0019 point 10.

Facts checked in the code on 2026-10-03:

- `pantin.json` is at `schema_version` 10 (`PANTIN_SCHEMA_VERSION`,
  `packages/protocol/src/pantin.ts`).
- Importers name a body's mesh `meshes/<bodyId>.<ext>`
  (`import-body.ts`, `step-bodies.ts`), and body ids are unique. The
  schema does not require mesh paths to be unique, so a hand-edited
  document could have two bodies share one file.
  `store.deleteMesh` also deletes the `.faces.json` next to a GLB
  (`pantin-store.ts`, `faceFilePathOf`).
- `releaseMesh` defers the deletion of a file that the saved
  `pantin.json` still references (`pendingMeshDeletions`). The file is
  deleted after the next save. A discard restores the document and keeps
  the file. The disk never references a missing mesh.
- Sensors name a joint, not a body. Actuators list joints (possibly none)
  and have an optional `feed` that names a drive (`actuator.ts`). Drives,
  actuators and sensors each have an `assembly` field.
- A joint's tags belong to its child body's assembly (ADR 0019 point 6).
  A joint between assemblies anchors its child's assembly to its parent's
  (ADR 0033 point 2).
- `keepDisplayedPose(old, new, positions)` rewrites the placement of every
  assembly whose anchor changed, so that nothing moves on screen at the
  current joint positions (`keep-displayed-pose.ts`). Joint deletion
  already relies on it.
- No deletion is refused while the simulation clock runs. The only use of
  the clock's `running` flag outside the loop is the pose stream
  (`server.ts`, `peekIsRunning`).

## Decision

1. **One rule.** Deleting an assembly with its contents removes:
   - everything the assembly owns: its bodies, drives, actuators and
     sensors;
   - every joint that touches one of its bodies, whether as parent or
     child, and including joints between assemblies. A joint cannot exist
     without both of its bodies.

   Everything another assembly owns stays exactly as it is in the
   document. When that is impossible, the deletion is refused (point 3).

2. **Effects on other assemblies, all automatic and listed in advance
   (point 5).**
   - The body on the other side of a removed joint between assemblies
     stays where it is. If that joint anchored another assembly Y to the
     deleted one, Y becomes anchored to the world. As in ADR 0033 point 6,
     the core rewrites Y's `placement` with `keepDisplayedPose` at the
     current joint positions, so nothing moves on screen. Assemblies
     anchored below Y keep their relative placements, so they do not move
     either. If the deleted assembly was itself anchored to another
     assembly, that assembly is not touched.
   - A removed joint whose child belongs to another assembly takes its
     tags with it, out of that assembly's tag list.
   - An actuator of the deleted assembly that moved a joint of another
     assembly is removed. That joint keeps its document entry. It stops,
     and it gets its setpoint tag back (ADR 0028 point 9).
   - A sensor of the deleted assembly that watched a joint of another
     assembly is removed. A drive of another assembly that fed a removed
     actuator stays and feeds nothing.

3. **Narrow refusal (`conflict`).** The deletion is refused when keeping
   another assembly's item unchanged would leave the document invalid:
   - an actuator of another assembly moves a joint that would be removed;
   - a sensor of another assembly watches a joint that would be removed;
   - an actuator of another assembly is fed by a drive that would be
     removed.

   The refusal answers the same message in the preview and in the
   deletion. The message lists every blocking item with its display name
   and its assembly, followed by what to do, for example: `Actuator "Vérin
   pince" of assembly "Pince" moves joint "Tige", which would be deleted.
   Remove the joint from the actuator, or delete the actuator, first.`
   Nothing is changed.

4. **Mesh and face files.** Every mesh path of a removed body that no
   remaining body uses is released through `releaseMesh`, which also
   releases its face file. If the saved `pantin.json` references the file,
   it waits for the next save, and a discard brings the whole assembly
   back with its files. A file written only in this session is deleted
   at once.

5. **API** (contract in `packages/protocol/src/assembly-api.ts`):
   - `GET .../assemblies/:assemblyKey/deletion` -> `AssemblyDeletion`.
     This is a dry run. It applies the same checks as the deletion and
     changes nothing, the unsaved flag included. It answers 404 for an
     unknown key and 409 with the point 3 message.
   - `DELETE .../assemblies/:assemblyKey?contents=delete` ->
     `AssemblyDeletionResponse`.
   - `DELETE .../assemblies/:assemblyKey` without the query is unchanged:
     an empty assembly is deleted (`PantinResponse`), anything else is
     refused with 409. The message now names what the assembly holds,
     joints included, and points to the deletion with contents. Existing
     clients and tests keep working.
   - Any other value of `contents` is refused with 400.

   `AssemblyDeletion` holds:
   - the `assembly` (key and name);
   - `bodies`, `drives`, `actuators` and `sensors` as `{ id, name }`;
   - `joints` as `{ id, name, betweenAssemblies }`;
   - `reanchoredAssemblies` as `{ key, name }` (point 2);
   - `removedTags` and `addedTags`, the tag names that disappear and
     appear. They are computed by comparing the tags of the document
     before and after, the same way as `renamedTags`.

   `AssemblyDeletionResponse` is `{ pantin, deleted: AssemblyDeletion,
   retainedMeshFiles }` (point 6). `deleted` describes what was actually
   removed, which may differ from an older preview if the document
   changed in between.

6. **Atomicity.** The service follows the order `deleteBody` uses:
   1. Wait for in-flight imports. A rollback removes its own assembly,
      joints and bodies by key and id.
   2. Compute the new document with a pure domain function and validate
      it against `PantinDocumentSchema`.
   3. Assign it in one statement. In the same synchronous section,
      forget the runtime state of the removed joints
      (`forgetJointRuntimeState`), drives (`forgetDriveRuntimeState`,
      which records its console events) and sensors (`sensorOutputs`).
      Also stop the surviving joints of removed actuators, as
      `tidyJoints` does. No `await` comes between the checks and the end
      of this step, so neither a simulation step nor another request sees
      a half-deleted assembly.
   4. Release the files. The document change is the commit point and is
      never undone. A release that fails, which can only be an I/O or
      permission error since `rm` uses `force`, does not stop the others.
      Its path is added to `pendingMeshDeletions`, so the next save tries
      again, and it is listed in `retainedMeshFiles`. The result is an
      orphan file, never a missing one, which is the safe direction of
      ADR 0006.

   The deletion is allowed while the clock runs, like every other
   deletion.

7. **Viewer.**
   - On an empty assembly (no body, drive, actuator or sensor), "Delete"
     works as it does today: it deletes at once, with no prompt.
   - On any other assembly, "Delete" asks the core for the preview. A
     409 goes to the message line through `store.run`'s usual failure
     path, and no prompt opens.
   - Otherwise the state records `pendingDeleteAssembly: { key,
     contents }`, which is cleared wherever `pendingDeleteBodyId` and
     `pendingDeleteJointId` are cleared. The inline prompt line then asks
     "Supprimer l'assemblage « {name} » et tout son contenu ?". Below it,
     one line per non-empty group gives the count and the display names
     (bodies, joints of the assembly, joints between assemblies, drives,
     actuators, sensors), then the removed and added tags, then the
     re-anchored assemblies ("reste en place, n'est plus rattaché à
     …"). No line shows an id.
   - `PromptView` gains an optional `details: string[]`, which the prompt
     line renders as a list.
   - "Supprimer" sends the deletion with `contents=delete`. On success,
     the viewer:
     - shows the Pantin;
     - selects the Pantin node;
     - drops the assembly's display state (`withAssemblyRemoved`);
     - ends an alignment session that involves the deleted assembly or a
       removed body;
     - closes a joint, drive, actuator or sensor form whose target was
       removed;
     - says "Assemblage « {name} » supprimé avec son contenu." If
       `retainedMeshFiles` is not empty, it adds a warning that some
       files will be deleted at the next save.

8. **No schema change.** The document format does not change, and
   `schema_version` stays 10. The protocol gains `AssemblyDeletion`,
   `AssemblyDeletionResponse` and the `contents` query schema, and
   nothing else.

## Rejected alternatives

- **Cascading into other assemblies**, by removing a foreign actuator's
  joint, a foreign sensor, or a foreign actuator's feed. Deleting one
  assembly would silently change the behaviour and the PLC tags of
  another one. The refusal is narrow and its message says exactly what to
  do.
- **Refusing whenever a joint between assemblies touches the assembly.**
  That is the common case of a clevis fixed on a carriage, and the joint
  cannot survive without its body anyway. Point 2 keeps every remaining
  body in place, as joint deletion already does.
- **Re-parenting a joint between assemblies to the world.** Joints link
  two bodies (ADR 0011), and this would quietly turn a fixture into
  something else.
- **Making plain `DELETE` cascade.** A client that relied on the 409 as
  a safety net, such as a script or a test, would lose data without
  asking. The opt-in query keeps that net.
- **Computing the preview in the viewer from its copy of the document.**
  The rule would then exist twice, and the viewer would hold domain
  logic (CLAUDE.md section 3.2).
- **A separate `POST .../delete-with-contents` route.** It does the same
  thing with a verb in the URL. `DELETE` with a query matches how imports
  pass options.
- **Failing the request when a file cannot be deleted.** The document has
  already changed. An error would tell the user that nothing happened
  when the assembly is in fact gone.

## Consequences

- Removing an imported STEP assembly takes one confirmation instead of
  six ordered requests.
- ADR 0019 gets "Amended by: ADR 0037" next to ADR 0033, and its point 10
  links here.
- The plain refusal message changes wording. Tests that match its text
  must be updated.
- `tags.ts` exposes the before/after tag comparison that `renamedTags`
  already uses internally.
- The viewer keeps three separate pending-delete fields. Merging them into
  one union `pendingDeletion` is a backlog item, not part of this ADR.
- To verify next: the viewer's behaviour today when a form or an
  alignment session targets a body or joint deleted on its own is
  NOT VERIFIED. If it is broken, that is a separate bug, out of scope.

### Slices

**I1, core and protocol, with tests.**

Files to touch:
- `packages/protocol/src/assembly-api.ts`: schemas and route comments.
- `packages/protocol/src/index.ts`: exports.
- New `packages/core/src/domain/assembly-deletion.ts`: the pure
  `deleteAssemblyWithContents(document, key, positions)`, which answers
  the document, the `AssemblyDeletion` and the mesh paths to release.
  `assembly-edits.ts` is near its 300-line limit.
- `packages/core/src/domain/assembly-edits.ts`: the new refusal message.
- `packages/core/src/domain/tags.ts`: the tag comparison.
- New `packages/core/src/service/assembly-deletion.ts`, or a function in
  `mesh-lifecycle.ts` next to `deleteBody`: the service steps of
  point 6.
- `assembly-operations.ts` and `pantin-service.ts`: wiring.
- `packages/core/src/http/assembly-routes.ts`: the GET route, and the
  `contents` query on DELETE.

Tests:
1. Domain, STEP case: 3 bodies and 2 internal fixed joints are all
   removed. The assembly is gone, and other assemblies are deep-equal to
   before.
2. Domain: an empty assembly gives the same result as `deleteAssembly`.
3. Domain: Y anchored to X by a slide at a non-zero position. The joint is
   removed, Y is anchored to the world, every body of Y keeps its
   displayed pose (within tolerance), Y's slide tags are in
   `removedTags`, and Y is in `reanchoredAssemblies`.
4. Domain: X anchored to Y. Y's placement is unchanged bit for bit.
5. Domain: chain Z -> Y -> X. Y and Z keep their world poses.
6. Domain: the assembly's own drives, actuators and sensors are removed.
   An own actuator that moved Y's joint leaves that joint in place, with
   its setpoint tag in `addedTags`.
7. Domain refusals, one test each: a foreign actuator moves a removed
   joint; a foreign sensor watches a removed joint; a foreign actuator is
   fed by a removed drive. Each test checks that the document is
   unchanged and that the message names the item, its assembly and the
   fix.
8. Domain: an unknown key gives `not_found`.
9. Domain: a mesh path still used by a remaining body (a hand-shared
   file) is not released.
10. Service: after an unsaved import, the GLB and the `.faces.json` are
    deleted at once.
11. Service: on a saved Pantin, the files remain until save and are gone
    after it. A discard instead restores the assembly with its files.
12. Service: the deletion waits for an import still in flight.
13. Service: the runtime state of removed joints, drives and sensors is
    forgotten, and a new joint with a reused id starts at 0. A removed
    actuator's surviving joint stops.
14. Service: when `store.deleteMesh` fails, the document change stands,
    the path is in `retainedMeshFiles` and `pendingMeshDeletions`, and
    the next save deletes it.
15. Service: a deletion while the clock runs is followed by a step that
    runs without error.
16. HTTP: the preview returns the contents and leaves the document and the
    unsaved flag unchanged.
17. HTTP: `DELETE ?contents=delete` answers 200 with an
    `AssemblyDeletionResponse`.
18. HTTP: plain `DELETE` of an empty assembly answers 200 with a
    `PantinResponse`. Plain `DELETE` of a non-empty one answers 409, and
    the message mentions joints.
19. HTTP: `?contents=other` answers 400. An unknown key answers 404 on
    both routes.

**I2, viewer, with tests.**

Files to touch:
- `api-assembly-routes.ts`: `previewAssemblyDeletion` and
  `deleteAssemblyWithContents`.
- `viewer-state.ts` and `session-state.ts`: the `pendingDeleteAssembly`
  field, with `withAssemblyDeleteRequested` and `withDeleteCancelled`,
  and the resets where the other pending-delete fields are reset.
- `controller/session-actions.ts`: `requestDelete` and `resolvePrompt`.
- `controller/assembly-actions.ts`: confirm and success handling.
- `panel/prompt-model.ts` and `ui/prompt-line.ts`: the `details` list.
- `i18n/locales/fr.json` and `en.json`.

Tests:
1. Client: URLs, method, query, and parsing of both responses.
2. `requestDelete` on an empty assembly deletes at once and never calls
   the preview.
3. `requestDelete` on a non-empty assembly calls the preview and opens the
   prompt with the details (display names only, every group, tags,
   re-anchored assemblies).
4. A preview 409 shows the core message and opens no prompt.
5. Cancel and Escape clear `pendingDeleteAssembly`.
6. Confirm sends `contents=delete`. Then the selection goes to the
   Pantin, the display state is dropped, the alignment session is ended,
   a form on a removed item is closed, and the message appears.
   `retainedMeshFiles` that is not empty adds the warning.
7. The prompt line renders `details` as a list.
