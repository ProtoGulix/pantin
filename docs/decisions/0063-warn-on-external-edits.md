# 0063. Warn when pantin.json or io.json changes outside Pantin

- Status: accepted (user, 2026-10-20)
- Date: 2026-10-20
- Amends: ADR 0006 (point 4: save), ADR 0049 (point 3: save; point 9:
  "Save in the core overwrites")
- Closes: `docs/backlog/detect-external-pantin-edits.md`, the external-edit
  consequence of ADR 0006 and that of ADR 0049

## Context

An open Pantin stays in the core's memory (ADR 0006). An edit made outside
(a text editor, `git pull`, `pantin io init --update`, ADR 0049 point 9)
goes unseen until a discard or a restart, and a save then overwrites it
without a word. On 2026-10-20 the user asked for a warning only: Pantin
tells the user that the file was modified outside.

Facts checked on 2026-10-20:

- Save writes io.json, if its text changed, then pantin.json, atomically,
  and never compares anything with the disk first
  (`service/mesh-lifecycle.ts`, `writeDocument`).
- Discard re-reads both files (ADR 0049 point 3). The viewer's "discard"
  menu item depends on `unsavedChanges` (`menu/menu-model.ts`, ADR 0049
  Context).
- `toResponse` is synchronous (`service/open-pantins.ts`). The viewer
  re-reads the Pantin after each edit. The store already stats pantin.json
  (`readDocumentModifiedAt`).
- The viewer has no window focus or `visibilitychange` handler today.
- Node's documentation says `fs.watch` is "not 100% consistent across
  platforms". It is NOT VERIFIED on WSL shares, network shares or editors
  that save by renaming.

## Decision

1. **Stamp.** For pantin.json and io.json, the open Pantin keeps a disk
   stamp: size, `mtimeMs` and the SHA-256 of the bytes, or `missing`. It is
   taken at load, after each save (from the written text and a `stat`) and
   after each discard.
2. **Check, on two events only.** `GET /api/pantins/:pantinId` and
   `POST .../save` stat both files.
   - Same size and mtime: unchanged.
   - Otherwise the file is read and hashed. A matching hash only updates the
     stamp, so a `touch` or a checkout of the same content stays silent.
   - A different hash, or a file created or deleted, marks that file as
     changed outside.
3. **Warning.**
   - A console entry `file_changed_outside` (warning, source `pantin`,
     params `{ file: "pantin.json" | "io.json" }`) is written once for each
     new disk content.
   - `PantinResponse` gains `changedOutside`, an array of those file names,
     empty by default. It is an API field added like `modifiedAt` (ADR 0027
     point 5), so pantin.json does not change.
4. **Save.**
   - Once the warning is shown, save overwrites, with no question asked:
     the banner has already said so.
   - A save that is itself the first to find a change answers 409 `conflict`
     ("pantin.json was modified outside Pantin since it was opened. Save
     again to overwrite it, or reload it."), writes the entry and sets the
     flag. The next save overwrites. An outside edit is therefore never
     lost without a warning.
   - Save and discard clear `changedOutside`.
5. **Viewer.**
   - The viewer re-reads the open Pantin when its window gets the focus
     back. That is when a user returns from an editor or a terminal.
   - While `changedOutside` is not empty, a banner sits at the top of the
     central area, with a glyph and text, never colour alone (ADR 0057):
     "pantin.json modifié en dehors de Pantin. Enregistrer l'écrasera."
   - The banner has one action, "Relire le fichier" / "Reload the file",
     which is `POST .../discard`, with the existing confirmation when
     `unsavedChanges` is true.
   - Labels in French and English.
6. **No automatic reload and no merge.** The user asked for a warning only.

## Rejected alternatives

- **`fs.watch`:** inconsistent across platforms (Context). Editors that save
  by renaming replace the watched inode, and a watcher per open Pantin is a
  resource to clean up. Checking on events costs one `stat` per file.
- **mtime alone:** a `git checkout` of the same content, or a coarse
  file-system clock, gives false alarms or missed changes. The hash settles
  it only when the cheap test differs.
- **Refusing every save until the user reloads:** more than a warning, and
  the in-memory edits would be stuck.
- **Overwriting silently, as today:** a `git pull` would be lost without a
  trace.
- **Checking on the 250 ms console poll:** a `stat` 4 times a second per
  viewer for an event the window focus already catches.
- **A confirmation dialog at each save:** the banner already says it, and
  the 409 covers the case where the user has seen nothing yet.

## Consequences

- **Protocol:** `changedOutside` in `PantinResponseSchema`, the code
  `file_changed_outside`, and its entry in `console-codes.json` and in the
  bridge's table.
- **Core:**
  - `store/pantin-store.ts`: a stamp read for each of the two files;
  - `service/open-pantins.ts`: the stamps and `changedOutside`;
  - `service/pantin-service.ts`: the check in `getPantin`;
  - `service/mesh-lifecycle.ts`: the check and the 409 in `writeDocument`,
    and the stamps after a save or a reload;
  - a pure stamp comparison in `domain/`.
- **Viewer:**
  - the focus re-read in the session controller;
  - the banner (pure model plus UI);
  - `messages.ts`.
- **Tests:**
  - an edit with a fixed mtime but a new size is detected;
  - a touch with the same bytes is not;
  - a created or deleted io.json is detected;
  - one entry per new content, none at the next `GET`;
  - the first save after an unseen edit is refused, the second overwrites;
  - save and discard clear the flag;
  - the viewer model shows the banner and discard asks for confirmation
    when there are unsaved changes.
- **Docs:** fundamentals.md ("Un Pantin, c'est un dossier") and a row in
  troubleshooting.md, FR and EN, and the CHANGELOG.
- **NOT VERIFIED:** mtime resolution on FAT and network shares. An edit that
  keeps both the size and the mtime is not seen.
