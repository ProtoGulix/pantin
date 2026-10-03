# 0038. Cleaning orphan mesh files

- Status: accepted
- Date: 2026-10-03
- Depends on: ADR 0006 (Pantin folder, explicit save, orphans left by
  unsaved imports), ADR 0035 (face files next to GLB meshes), ADR 0037
  (`PromptView.details`, files released after a deletion)

## Context

On 2026-10-03 the user asked for "a command to clean orphans, accessible
in the menu" (backlog `docs/backlog/clean-orphan-meshes.md`).

An orphan is a file in a Pantin's `meshes/` folder that no body uses. It
takes disk space. Its name also blocks a body id: importers avoid every
file stem already present in `meshes/` (`takenMeshStems`,
`import-operations.ts`, then `makeUniqueId`). Real case:
`~/pantin-projects/test/meshes/3630-00-0800n-0.glb` (1 190 116 bytes).
No body of `test/pantin.json` uses it, while
`3630-00-0800n-0-1.glb` and `-2.glb` are both in use.

Orphans come from several places:
- an import that was never saved, when the core stopped before a save
  or a discard (ADR 0006, consequences);
- a delete that failed with an I/O error during a discard
  (`reloadDocument`), during an import rollback (`releaseMesh`), or
  after a save (`deletePendingMeshes`);
- a body deleted by hand-editing `pantin.json`.

Facts checked in the code on 2026-10-03:

- The core always writes a mesh as `meshes/<bodyId>.glb` or `.stl`. A
  STEP body may also get `meshes/<bodyId>.faces.json`
  (`faceFilePathOf`, `face-file.ts`). It writes with flag `wx`, straight
  to the final name: no temporary file is ever created in `meshes/`.
  The STEP converter works in a private `mkdtemp` folder under the OS
  temp directory and removes it afterwards (`step-converter.ts`). The
  only temporary file of a Pantin is `.pantin.json.<uuid>.tmp`, in the
  Pantin folder, not in `meshes/`.
- An import adds its bodies to the in-memory document in the same
  synchronous step that registers it in `inFlightImports` (`reserve`).
  Only after that does it write any file. A file being written by an
  import is therefore always used by the in-memory document. A
  rollback releases the files it wrote.
- `releaseMesh` does not delete a file that the saved `pantin.json`
  references, or that a save in progress is writing
  (`isReferencedOnDisk`). It puts the path in `pendingMeshDeletions`
  instead, and the next save deletes it. A discard restores the saved
  document, which needs those files.
- `deletePendingMeshes` removes a path from the pending set before it
  calls `deleteMesh`. A failed delete is therefore never retried. The
  exception goes up through `writeDocument`, so the save request fails
  although `pantin.json` was written. The I/O cause is recorded
  nowhere.
- `store.deleteMesh` calls `rm` with `force` on the mesh and on its
  face file. `listMeshFileNames` returns every directory entry
  (directories and links included), without sizes.
  `openMesh` and `readFaceFile` use `lstat` and never follow a
  symbolic link (`pantin-store.ts`).
- The "Fichier" menu holds Accueil, Ouvrir…, Enregistrer, Importer…
  and Fermer. Per ADR 0030 point 4, the "Édition" menu acts on the
  selection (`menu-model.ts`).
- The JSON request body is limited to 64 KiB (`MAX_JSON_BODY_BYTES`,
  `request-reading.ts`).

## Decision

1. **What an orphan is.** A file of `meshes/` is an orphan when all of
   these hold:
   - it is a regular file directly in `meshes/`. Subfolders, symbolic
     links and other special files are never listed, never followed and
     never deleted;
   - its name ends in `.glb`, `.stl` or `.faces.json`, ignoring case.
     Any other file (notes, `.blend`, `.DS_Store`) belongs to the user
     and is never listed;
   - none of the following uses it, either as a mesh or as the face file
     of a GLB mesh:
     - the in-memory document;
     - the saved `pantin.json` (`savedMeshPaths`);
     - a save in progress (`writingMeshPaths`);
     - the pending deletions (`pendingMeshDeletions`).

   A file that only the saved document uses is kept, for three reasons:
   - a discard brings that document back, and it needs the file;
   - the next save deletes the file anyway, through
     `pendingMeshDeletions`;
   - deleting it now would leave a `pantin.json` on disk that points to a
     missing mesh, which ADR 0006 and `mesh-lifecycle.ts` forbid.

   In-flight imports need no rule of their own. Their files are always
   used by the in-memory document (Context), and the service also waits
   for them first (`loadSettledPantin`).

   The comparison over-keeps on purpose. A body path is normalised: `\`
   becomes `/`, then it is resolved the way the store resolves it
   (relative to the Pantin folder, absolute paths as they are). If the
   resolved parent folder is named `meshes`, ignoring case, wherever it
   is, its file name keeps every `meshes/` file with the same name,
   ignoring case. An error therefore keeps a file and never deletes a
   used one. That way hand-edited `./meshes/Rail.GLB`,
   `Meshes/rail.glb`, `../<pantinId>/meshes/rail.glb` or an absolute
   path still protect `rail.glb`. (Amended at review, 2026-10-03: plain
   `normalize` missed paths that leave and re-enter the Pantin folder.)

2. **Only `meshes/`.** The cleanup never touches `pantin.json`, its
   temporary files or anything outside `meshes/`. Every path is
   `resolveInside(meshes, fileName)`. Both routes answer 400
   `invalid_request` when the Pantin folder or `meshes/` is a symbolic
   link, or when `realpath(meshes)` is not
   `join(realpath(pantinFolder), "meshes")`. Checking only that the folder
   stays inside the pantins directory is not enough: a link to another
   Pantin's `meshes/` would list that Pantin's used files as orphans.
   `lstat` checks each file. Deletion uses `unlink`, which removes a
   link itself and never what it points to.

3. **API** (contract in a new `packages/protocol/src/orphan-mesh-api.ts`).
   - `GET /api/pantins/:pantinId/orphan-meshes` -> `OrphanMeshList`.
     This is a dry run that changes nothing.
     `OrphanMeshList = { files: OrphanMeshFile[], totalSizeInBytes }`,
     with `OrphanMeshFile = { fileName, sizeInBytes }`, sorted by name.
     The size comes from `lstat`.
   - `POST /api/pantins/:pantinId/orphan-meshes/delete`
     `OrphanMeshDeletionRequest` -> `OrphanMeshDeletionResponse`.
     - The request is `{ fileNames: MeshFolderFileName[] }`, with 0 to
       200 entries.
     - A `MeshFolderFileName` is 1 to 255 characters, holds no `/`,
       `\` or NUL, and is not `.` or `..`.
     - Duplicates are ignored.
     - 200 names of 255 characters fit in the 64 KiB body limit.
   - **Recompute and intersect.** The core recomputes the orphans at
     deletion time and deletes only the names that are both requested
     and still orphans. For each file the store first checks the folder
     and `lstat`s the file, then calls the keep-rule re-check
     synchronously right before `unlink`, without an `await` in between;
     a file the re-check keeps ends in `skipped`. A file that became used
     after the preview is therefore never deleted.
   - `OrphanMeshDeletionResponse` is
     `{ deleted: OrphanMeshFile[], skipped: string[], failed: { fileName,
     errorCode }[] }`:
     - `skipped`: names that are no longer orphans, no longer exist or
       are not regular mesh files. Nothing is done to them;
     - `failed`: names whose `unlink` failed. `errorCode` is the
       Node.js `code` (`EACCES`, `EPERM`, `EBUSY`, `EROFS`…), or
       `"unknown"` when there is none. It is never a message, because
       messages may contain absolute paths (`describeDocumentLocation`).
   - **Partial failure.** A file that fails does not stop the others.
     The request still answers 200: every file has its own outcome, and
     the document did not change. Errors before the loop answer as usual:
     - 404 for an unknown Pantin;
     - 400 for an invalid body or a linked folder (point 2), 415 for a
       wrong content type (the existing `readJsonBody` rule);
     - 500 when the listing itself fails.
   - The route uses a verb in its URL, `POST .../delete`, like `save`
     and `discard`.

4. **Ordering.**
   - The preview waits for in-flight imports (`loadSettledPantin`).
   - The deletion runs in the Pantin's save queue (`runQueued`, now
     exported from `mesh-lifecycle.ts`). It never runs while a save or
     a discard is running, and it also waits for in-flight imports.
   - The keep rule is a single exported function,
     `meshPathsToKeep(openPantin)`, in `mesh-lifecycle.ts` next to
     `isReferencedOnDisk`. The pure part is in a new
     `packages/core/src/domain/orphan-meshes.ts`:
     `findOrphanMeshFiles(files, meshPathsToKeep)`.

5. **No change to `pendingMeshDeletions`.** The one-shot retry stays as
   it is. If the retry after a save fails, the file is used by nothing,
   so the cleanup lists it and reports the I/O cause if it fails again.
   The command is the recovery path for that file, and the "cause is
   lost" note is answered for any file the user tries to clean.
   Making `deletePendingMeshes` keep failed paths and not fail the save
   would change the save's error contract. That is a separate fix, and
   it stays in the backlog. The cleanup never reads or writes the
   pending set, except through the keep rule.

6. **Pantin, unsaved flag, clock.**
   - Like every `/api/pantins/:pantinId/...` route, the core works on the
     Pantin through `loadPantin`. A Pantin that is not open is loaded
     from `pantin.json`, and the keep rule then reduces to the saved
     document. The viewer offers the command only while a Pantin is open.
   - The document is never changed, so the unsaved flag is not
     touched. The response does not carry a `PantinResponse`.
   - The cleanup is allowed while the clock runs. Neither the
     simulation step nor the pose stream reads mesh files.
   - No console event is recorded, because console codes are a closed
     protocol list. The response carries every outcome.

7. **Viewer.**
   - **Menu.** "Fichier" gets "Nettoyer les fichiers orphelins…"
     (en: "Clean up orphan files…"), after "Importer…" and before the
     separator. It is enabled when a Pantin is open, no request is
     running and no import is in progress. It goes in "Fichier" and not
     in "Édition", because it acts on the Pantin folder, not on the
     selection (ADR 0030 point 4).
   - **Preview.** The command calls the preview.
     - An empty list shows the info message "Aucun fichier orphelin."
       and opens no prompt.
     - A failure goes through `store.run`'s usual failure path.
   - **Prompt.** Otherwise the state records
     `pendingOrphanCleanup: OrphanMeshList`. It is cleared:
     - wherever `pendingDeleteAssembly` is cleared (close, open,
       another Pantin);
     - by any delete request;
     - by Cancel or Escape.

     Requesting the cleanup clears the other pending deletions, so only
     one prompt shows at a time.

     The prompt line asks "Supprimer {count} fichier(s) orphelin(s) du
     dossier meshes ({size}) ? Aucun corps ne les utilise.", using
     `pluralKey` for one and other. `details` lists one line per file,
     "{fileName} ({size})". After 20 lines it ends with "… et {count}
     autre(s)". The buttons are "Supprimer" and "Annuler", with new
     prompt actions `confirmOrphanCleanup` and `cancelOrphanCleanup`.
   - **Sizes.** A new pure `formatFileSize(bytes, language)` uses
     decimal units (1 ko = 1000 octets) through `Intl.NumberFormat`
     with `style: "unit"`. The exact French output ("1,2 Mo") is
     NOT VERIFIED, and a test will pin it.
   - **Confirm.** "Supprimer" sends exactly the previewed names, in
     sequential batches of 200, and merges the responses.
   - **Result.**
     - Everything deleted: info "{count} fichier(s) orphelin(s)
       supprimé(s) ({size} libérés)."
     - With `skipped`: the same message with "{skipped} ignoré(s) :
       utilisé(s) entre-temps ou déjà absent(s)", and the skipped names
       in `detail`.
     - With `failed`: an error message "{failed} fichier(s) n'ont pas
       pu être supprimés (droits insuffisants ou fichier ouvert
       ailleurs) ; {deleted} supprimé(s).", with
       `detail` = `"name.glb: EACCES, other.stl: EBUSY"`. As
       `PanelMessage.detail` requires, the detail holds only file names
       and codes, which are language-neutral.

8. **No schema change.** `pantin.json` keeps `schema_version` 10. The
   protocol gains `MeshFolderFileNameSchema`, `OrphanMeshFileSchema`,
   `OrphanMeshListSchema`, `OrphanMeshDeletionRequestSchema` and
   `OrphanMeshDeletionResponseSchema`, and nothing else.

## Rejected alternatives

- **Deleting orphans automatically**, on open or after a save. The
  backlog says "never automatically". A file the user dropped in
  `meshes/` by hand would disappear without a word.
- **Offering the cleanup in a prompt every time a Pantin opens.** That
  would interrupt every opening for files the user may want to keep.
  The user asked for a menu command.
- **Deleting whatever names the client sends.** A file that became used
  between the preview and the confirmation would be lost. Recomputing
  and intersecting costs one `readdir`.
- **Deleting every current orphan without a list.** The user would
  confirm one set of files, and the core would delete another set if
  orphans appeared in between.
- **Listing every file of `meshes/`, any extension.** The core never
  writes other files, so anything else was put there by the user.
- **Treating a file used only by the saved document as an orphan.**
  That breaks the discard and leaves `pantin.json` pointing to a
  missing mesh (point 1).
- **`DELETE .../orphan-meshes` with a JSON body.** A DELETE body has no
  generally defined meaning in HTTP (RFC 9110, section 9.3.5, NOT
  VERIFIED in this run), and some clients and proxies may drop it.
  Putting the names in the query would run into URL length limits.
- **Deleting a GLB together with its face file through
  `store.deleteMesh`.** The core would then delete a file the user did
  not see in the list. Each file is listed and deleted on its own.
- **Answering a failure with the error message.** Messages can reveal
  absolute paths. The `code` is enough to act on.
- **Fixing the one-shot retry in `deletePendingMeshes` here.** It
  changes how a save fails. The cleanup already recovers the file
  (point 5).
- **A console event per failure.** It would add codes to a closed
  protocol list for something the response already reports.

## Consequences

- The `test` Pantin's `3630-00-0800n-0.glb` can be removed from the
  menu, which frees the id `3630-00-0800n-0`.
- The backlog file `clean-orphan-meshes.md` becomes
  `retry-deferred-mesh-deletions.md`, about the deferred
  deletion subject: a failed pending deletion makes the save request
  fail after `pantin.json` was written, and is not retried.
- ADR 0006's consequence "cleaning it is backlog" points to this ADR.
- `PantinStore` gains `listMeshFolderFiles` and `deleteMeshFolderFile`.
  `listMeshFileNames` stays as it is: when the import avoids names, it
  must count every name, directories included.
- `mesh-lifecycle.ts` exports `runQueued` and `meshPathsToKeep`.
- Accepted limits of the viewer (found at review of I2): the result
  message keeps the freed size formatted in the language of the moment,
  so a language switch re-translates the text but not the size. If a
  batch fails after earlier batches succeeded, the viewer shows the
  error and keeps the prompt without reporting the partial deletions; a
  retry lists those files as skipped. The core re-checks every name, so
  neither case is unsafe.
- Pinned on Node 24: French sizes read `1,2 Mo` with a narrow no-break
  space (U+202F); English bytes read `512 byte`.
- To verify next: the exact `Intl.NumberFormat` output in French
  (NOT VERIFIED). On Windows, `unlink` of a file the viewer or another
  program keeps open (`EBUSY` or `EPERM`) is NOT VERIFIED. It is
  reported as a failure either way.

### Slices

**I1, core and protocol, with tests.**

Files to touch:
- New `packages/protocol/src/orphan-mesh-api.ts`: schemas and route
  comments.
- `packages/protocol/src/index.ts`: exports.
- New `packages/core/src/domain/orphan-meshes.ts`: `keptMeshFileNames`
  (normalisation, case folding, face file of a GLB) and
  `findOrphanMeshFiles`.
- `packages/core/src/store/pantin-store.ts`: `listMeshFolderFiles`
  (regular files only, with their sizes, through `lstat`; a missing
  folder gives an empty list) and `deleteMeshFolderFile` (`lstat`, then
  `unlink`; answers `"deleted"`, `"missing"` or `"not_a_file"`, and
  throws I/O errors).
- `packages/core/src/service/mesh-lifecycle.ts`: export `runQueued` and
  `meshPathsToKeep`.
- New `packages/core/src/service/orphan-mesh-cleanup.ts`:
  `listOrphanMeshes` and `deleteOrphanMeshes`.
- `packages/core/src/service/pantin-service.ts`: wiring.
- New `packages/core/src/http/orphan-mesh-routes.ts`, listed in
  `ROUTES` in `routes.ts`.

Tests:
1. Domain: an unused `.glb`, a `.stl` and a lone `.faces.json` are
   listed with their sizes, sorted, with the right total.
2. Domain: a used GLB and its face file are kept. The face file of an
   orphan GLB is listed.
3. Domain: paths only in the saved set, the writing set or the pending
   set are kept.
4. Domain: `notes.txt`, `part.blend` and `.DS_Store` are never listed.
5. Domain: `./meshes/Rail.GLB` and `meshes\rail.glb` keep `rail.glb`.
6. Store: listing skips subfolders and symbolic links, and gives an
   empty list when `meshes/` is missing.
7. Store: deleting a symbolic link to a file outside answers
   `not_a_file`, and the target is unchanged. A missing file answers
   `missing`.
8. Service: an unsaved import is not an orphan. A saved body deleted
   but not yet saved is not an orphan.
9. Service: a file left by an import that was never saved (written
   directly to `meshes/`) is listed, then deleted. The document and
   the unsaved flag stay unchanged.
10. Service: a requested name that is used, missing, or not a mesh
    (`notes.txt`) ends in `skipped`, and the file is left in place.
11. Service: a store whose `unlink` throws `EACCES` for one file:
    that file is in `failed` with `"EACCES"`, and the others are
    deleted.
12. Service: when the retry after a save fails, the file is listed
    afterwards and the cleanup deletes it (point 5).
13. Service: the deletion waits for an in-flight import and for a save
    already queued.
14. Service: a cleanup while the clock runs is followed by a step that
    runs without error.
15. HTTP: GET answers the list. An unknown Pantin answers 404 on both
    routes.
16. HTTP: POST answers 200 with the response. `GET /pantins/:id` shows
    the same `unsavedChanges` before and after.
17. HTTP: these bodies answer 400: names `""`, `".."`,
    `"../pantin.json"` and `"a/b.glb"`, 201 names, a body that is not
    an array; a wrong content type answers 415. `pantin.json` is
    unchanged.
18. HTTP: a symbolic link on `meshes/` pointing outside answers 400 on
    both routes.

**I2, viewer, with tests.**

Files to touch:
- New `packages/viewer/src/api-orphan-mesh-routes.ts`:
  `listOrphanMeshes` and `deleteOrphanMeshes`.
- `packages/viewer/src/menu/menu-definitions.ts`: the
  `"cleanOrphans"` command.
- `packages/viewer/src/menu/menu-model.ts`: the Fichier entry.
- `packages/viewer/src/controller/menu-commands.ts`: dispatch.
- New `packages/viewer/src/controller/orphan-cleanup-actions.ts`:
  request, confirm and batches.
- `packages/viewer/src/viewer-state.ts` and `session-state.ts`: the
  `pendingOrphanCleanup` field and its resets.
- `packages/viewer/src/panel/prompt-model.ts`: the branch and the two
  actions.
- `packages/viewer/src/controller/session-actions.ts`:
  `resolvePrompt` cases.
- New `packages/viewer/src/panel/orphan-cleanup-details.ts`:
  `formatFileSize`, the detail lines with their cap, and the result
  message.
- `packages/viewer/src/i18n/locales/fr.json` and `en.json`.

Tests:
1. Client: URLs, methods, JSON body, and parsing of both responses.
2. Menu: the entry is in Fichier after Importer…, and is disabled with
   no Pantin open, while busy or while importing.
3. An empty preview shows "Aucun fichier orphelin." and opens no
   prompt.
4. A non-empty preview opens the prompt with the count, the total size,
   and one detail line per file. With 25 files, there are 20 lines plus
   "… et 5 autres".
5. Cancel and Escape clear `pendingOrphanCleanup`. So do closing the
   Pantin and a body delete request.
6. Confirm sends exactly the previewed names. With 450 names, it sends
   3 sequential batches (200, 200, 50) and merges the results.
7. Result messages: all deleted (info, freed size); some skipped (info
   with the names in detail); some failed (error, detail
   `"a.glb: EACCES"`).
8. `formatFileSize` in French and English: bytes, ko or kB, Mo or MB.
