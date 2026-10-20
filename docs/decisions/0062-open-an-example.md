# 0062. Open an example from the welcome window

- Status: accepted (user, 2026-10-20)
- Date: 2026-10-20
- Extends: ADR 0027 (welcome window), ADR 0006 (Pantin folder, routes)
- Closes: the "Open an example" item of ADR 0027's rejected alternatives
  and of `docs/backlog/console-and-diagram-extras.md`

## Context

ADR 0027 left "Open an example" out, because the core serves only its
Pantins folder. On 2026-10-20 the user decided that a core route will copy
an example into that folder.

Facts checked on 2026-10-20:

- `examples/axis` (pantin.json, two STL meshes) and `examples/plc-cylinder`
  (pantin.json, io.json, three GLB meshes) are at `schema_version` 13, which
  is `PANTIN_SCHEMA_VERSION`. `cli/src/validate-folder.test.ts` checks axis
  only. The bridge closed-loop test copies plc-cylinder
  (`core/src/test-support/plc-cylinder.ts`).
- `main.ts` takes `--pantins-dir`, `--viewer-dir`, the two Python paths and
  `--logs-dir`. It has no examples option. `pnpm serve` runs the core from
  the repository root.
- `PantinIdSchema` refuses dots and slashes (ADR 0006 point 2). A body's
  `mesh` is only `z.string().min(1)` (`protocol/src/pantin.ts:92`).
- `createPantin` builds the id with `makeUniqueId`, which adds `-2`, `-3`
  and so on, writes pantin.json and opens the Pantin
  (`service/pantin-service.ts`). `writeMesh` uses the `wx` flag, and
  `resolveInside` plus `assertRealPathInside` check every path
  (`store/pantin-store.ts`, `store/safe-paths.ts`).
- The development exposure is `pnpm serve` behind Cloudflare Access
  (ADR 0014, `deploy/dev-exposure/README.md`). Server mode with docker
  compose is not built.

## Decision

1. **Option `--examples-dir <path>`.** No flag means no examples: the list
   is empty and the viewer hides the section. `pnpm serve` passes
   `--examples-dir examples`. At start-up the core refuses a path that is
   not a directory, as for `--viewer-dir`, and prints "Examples from ..."
   or "Examples disabled". The core never guesses a repository layout,
   because an installed core may have no `examples/`.
2. **Which examples are listed.** Each subfolder whose name passes
   `PantinIdSchema` and that passes every check below. A folder that fails
   is left out, as `GET /api/pantins` leaves out invalid folders, and the
   reason goes to the server log.
   - pantin.json is read and validated by `readValidDocument`, migrations
     included.
   - io.json, if present, reads as `valid`.
   - Every `mesh` has the form `meshes/<file name>` with a safe file name,
     and is a regular file (`lstat`, never a link) inside the folder after
     `realpath`, at most `MAX_IMPORT_BYTES`. A GLB's face file, when present,
     follows the same rule.
3. **Protocol** (`protocol/src/examples.ts`):
   - `GET /api/examples` returns `{ examples: [{ id, name, bodyCount }] }`;
   - `POST /api/examples/:exampleId/copy` with `{ name? }` (a
     `DisplayNameSchema`, by default the example's name) returns 201 and a
     `PantinResponse`, with the copy open, as `POST /api/pantins` does;
   - 404 for an unknown or unlisted example, also when examples are
     disabled; 400 for an id that fails `PantinIdSchema`.
4. **Copy.**
   - The id is `makeUniqueId(slugifyDisplayName(name))` against the folders
     on disk and the open Pantins, so a second copy of `axis` is `axis-2`.
   - The checks of point 2 run again at copy time, so a file that changed
     after listing is still checked.
   - Only an allowlist is copied: the referenced meshes and their face
     files (`wx`), the canonical io.json if any, then pantin.json last, as
     canonical text with the chosen name. A folder without pantin.json is
     never listed as a Pantin, so a copy that stops halfway is never shown.
   - If any write fails, the folder this request created is removed, and
     only that folder.
   - The README and any other file stay behind (ADR 0006 point 1, ADR 0049).
5. **Network: nothing changes.** Same listener, same Host checks (ADR 0004,
   ADR 0006). The route only writes inside the Pantins folder, as creating
   a Pantin does. In LAN mode an allowed client can copy as it can create.
   The development exposure gets examples through `pnpm serve`, still behind
   Access. A future server image sets the flag only if it ships examples.
6. **Viewer.**
   - The Home tab gains "Exemples" / "Examples" between New and Recent: a
     card per example with its name and body count.
   - A click asks for a name, prefilled with the example's name, as "Empty
     Pantin" does (ADR 0027 point 3), then copies and opens the copy.
   - The section is hidden when the list is empty. Labels in French and
     English.

## Rejected alternatives

- **Opening the example in place:** saving would edit the repository's
  files, and the core would serve a second folder.
- **Defaulting to `<repository>/examples`:** it ties the core to the source
  tree. An explicit flag works like `--viewer-dir`.
- **Copying the whole folder recursively:** it would bring in links,
  READMEs and stray files. The allowlist copies only what a Pantin folder
  holds.
- **Copying the files byte for byte without validation:** an invalid or
  linked example would become a broken Pantin, or a way to read outside
  the examples folder.
- **A list of examples written into the viewer:** it would go stale, and
  the viewer would know about files.

## Consequences

- **Protocol:** `examples.ts` and its routes in the `api.ts` comment block.
- **Core:**
  - `main.ts` (the flag and the start-up line), `http/server.ts`;
  - a store for the examples folder (read-only, `store/`);
  - `service/example-operations.ts` and `http/example-routes.ts`.
- **Viewer:** `panel/welcome-model.ts`, `ui/welcome-home.ts`, `messages.ts`.
- **Tests:**
  - `examples/axis` and `examples/plc-cylinder` are both listed, so an
    example that stops being valid fails `pnpm check`;
  - two copies give `axis` and `axis-2`;
  - a copy opens and serves its meshes;
  - an example with a link, a `../` mesh path or an invalid io.json is not
    listed;
  - `..` and `%2e%2e` as ids answer 400, and `a%2Fb` answers 400 or 404
    (a slash never reaches the id check as part of an id);
  - without the flag the list is empty and a copy answers 404;
  - a write that fails removes the folder;
  - the viewer model hides the empty section.
- **Docs:** tutorial.md (Bienvenue) and fundamentals.md ("Installer et
  démarrer", the flag), FR and EN, and the CHANGELOG.
- **NOT VERIFIED:** whether `examples/plc-cylinder/io.json` reads as `valid`
  against its pantin.json. The listing test checks it.
