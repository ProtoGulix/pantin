# 0049. One io.json, edited from the viewer

- Status: accepted
- Date: 2026-10-13
- Partly superseded by: ADR 0064 (io.json version 2 with one transport per module, see its header)
- Amended by: ADR 0063 (io.json changed outside Pantin)
- Partly supersedes: ADR 0045 (point 4: `io_changed` also on a mapping
  change; point 6: `io.csv` and `io-modules.json`; point 7: the syntax
  rules, the rename rule, the route reading files from disk, `mappingId`,
  problem positions; point 9: `pantin io init` and `pantin gvl` on the CSV;
  point 10: `mappingId` checked against the open mapping)
- Extends: ADR 0021 (a second public schema with its JSON Schema), ADR 0047
  (links between the tree and the mapping), ADR 0028 point 10 (route style)
- Changes: CLAUDE.md sections 5 (I/O list) and 13.7 (GVL from io.json);
  brings the "mapping I/O" item of section 13.8 forward

## Context

ADR 0045 P2 split the PLC I/O over two files the user edits by hand: a
strict semicolon CSV and a JSON file of module settings. The user decided
on 2026-10-13:

- **One file**, `io.json`, validated by a Zod schema in the protocol, will
  replace both.
- **A full editor in the viewer** will create and edit everything: modules,
  channels, a proposed address, live problems. Nobody ever edits the file
  by hand. The UI is a client of the API (CLAUDE.md 3.4).
- A CSV export for spreadsheets goes to the backlog.
- The bridge keeps reading the validated mapping through `GET .../io`,
  never the file.

The same day, the user answered the architect's questions: renames carry
over into io.json (point 10); legacy files are converted by one explicit
command only (point 8); a mapping edit may stop a running bridge (point 7);
the editor is a central view (point 11).

Facts checked in the repository on 2026-10-13 (`develop` unless stated):

- `core/src/domain/io-list.ts` (254 lines) is the hand-written CSV parser.
  Of the 23 codes in `IO_PROBLEM_CODES` (`protocol/src/io-mapping.ts`), 11
  exist only because of the CSV and the two-file split: `byte_order_mark`,
  `bad_header`, `blank_line`, `bare_carriage_return`, `wrong_field_count`,
  `quote_in_field`, `invalid_zone`, `invalid_type`, `invalid_address`,
  `modules_missing`, `unknown_module`.
- `service/io-operations.ts` reads both files from disk on every
  `GET .../io` and checks them against the open document.
  `domain/io-evaluation.ts` hashes the two files' lengths and bytes into
  `mappingId`.
- `io_changed` is sent only when `tagListSignature` changes
  (`domain/bus-feed.ts`, `domain/tags.ts`). An edit to `io.csv` is noticed
  at the bridge's next `hello`, which the core refuses with 4003
  (`bus/bus-hello.ts`).
- Documents are edited in memory and written only by `POST .../save`, with
  a temporary file then a rename (`store/pantin-store.ts`).
  `POST .../discard` reverts them. `unsavedChanges` compares the canonical
  text with the saved one (`service/open-pantins.ts:172`). The viewer
  re-reads the Pantin after an edit, and Save depends on `unsavedChanges`
  (`menu/menu-model.ts`).
- Element routes are a `POST` on the collection and a `PATCH` and `DELETE`
  on the item (`http/drive-routes.ts`, ADR 0028 point 10).
  `PUT .../tags/:tag` already carries a tag name in the path.
- `renamedTags(before, after)` (`domain/tags.ts:183`) pairs tags by owner
  and member. Assembly, drive and sensor operations return it. The open
  document is assigned in 24 places across 10 non-test service files, so
  there is no single place to hook into.
- The CLI has `io init` (module `m1`, port 1502, each tag after the highest
  used address of its zone, `deriveVariable`), `gvl`, `validate`, and
  `schema` (pantin.json only, committed to
  `protocol/schema/pantin.schema.json` and tested for freshness, ADR 0021).
- The bridge decoder `bridge/src/pantin_bridge/io_mapping.py` and the
  fixture `protocol/fixtures/io-mapping-responses.json` are on `develop`
  (ADR 0045 P3, commit 94be66e). The decoder reads `modules`,
  `rows` (with `line`), `problems` (`file`, `line`, a known `code`) and
  `unmappedTags`.
- No `io.csv` or `io-modules.json` is committed anywhere, examples
  included. `examples/plc-cylinder` (ADR 0045 P4) is not written. Whether
  users have such files outside the repository is NOT VERIFIED.
- The ADR 0045 point 8 table gives each valid (tag type, direction) pair
  exactly one zone and one PLC type. A register zone therefore only ever
  holds REAL or DINT, two registers each.
- Central layouts are `"3d" | "diagram" | "both"`
  (`viewer/src/central-layout.ts`).

## Decision

1. **One file, `io.json`**, in the Pantin folder:

   ```json
   { "schema_version": 1,
     "modules": [ { "key": "m1", "port": 1502, "unitId": 1,
       "wordOrder": "low_word_first", "watchdogMilliseconds": 1000,
       "channels": [ { "tag": "pince.valve.coil_a", "variable": "pince_valve_coil_a",
         "zone": "coil", "address": 0, "ioType": "BOOL", "comment": "" } ] } ] }
   ```

   Two refinements of the requested shape:
   - The channel's `type` becomes `ioType`. This is the name the protocol
     (`IoTypeSchema`) and the bridge already use. It also avoids a clash
     with the tag's own `type` in the API answer (point 5).
   - A tag appears in at most one channel, enforced by the schema. This
     makes the tag the channel's key (point 4).

   `zone` and `ioType` could be derived from the tag, but they stay stored.
   io.json is the contract with the PLC program: if a document change
   alters a tag's type, that shows as a problem instead of silently moving
   a channel. Clients never send them: the core derives them (point 4).
   `variable` is stored for the same reason: the PLC program uses it.

   Module rules are unchanged from `IoModuleSchema`: ports from 1024 to
   65535 and unique, unique keys, unit id from 1 to 247, watchdog from 100
   to 3 600 000 ms, and the same defaults. Each channel's `tag` matches
   `TagNameSchema` and its `address` is an integer from 0 to 65535. Unknown
   fields are refused. The file is at most 1 MiB, UTF-8, and a BOM is
   skipped on read, as for `io-modules.json` today.

   The canonical text uses 2-space indentation and a final newline.
   Channels are sorted by zone (order of `IO_ZONES`), then address, then
   tag, so that git diffs stay small and match the editor.
2. **A public schema.** `IoDocumentSchema` in `protocol/src/io-document.ts`,
   `schema_version: 1`, falls under CLAUDE.md 14.6 from now on.
   - Its JSON Schema is generated to `protocol/schema/io.schema.json` by
     `pantin schema io`; plain `pantin schema` keeps printing pantin.json's.
     It is committed and tested for freshness, as in ADR 0021.
   - The legacy pair is "version 0", and the only migration is
     `pantin io migrate` (point 8).
   - `IoModulesFileSchema` is removed.
3. **Same model as pantin.json: open, edit, save, discard.**
   - Opening a Pantin reads io.json beside pantin.json. The open Pantin
     holds the mapping and its saved canonical text.
   - `unsavedChanges` is true when either file differs from its saved text.
   - Save writes io.json, then pantin.json, each atomically. It writes
     io.json only when its text changed.
   - Discard reverts both, re-reading from disk, which is how an outside
     edit is picked up.
   - A crash between the two writes leaves a new io.json beside an old
     pantin.json. Validation then reports unknown tags and nothing is lost.

   Reason: the mapping names the document's tags and is validated against
   the open document, unsaved edits included (ADR 0045 point 7). With
   writes on disk at once, a discarded rename would leave io.json pointing
   at names that do not exist on disk, and the user would face two save
   models in one window.
4. **Routes**, under `/api/pantins/:pantinId/io`. Every answer is the whole
   `IoMappingResponse`. As after a drive edit, the viewer then re-reads the
   Pantin for `unsavedChanges`.

   | Route | Body | Effect |
   | --- | --- | --- |
   | `GET .../io` | none | the open mapping, checked |
   | `POST .../io/modules` | settings, all optional | adds a module: the smallest free `m<n>` key, the smallest free port ≥ 1502, ADR 0045 defaults; 201 |
   | `PATCH .../io/modules/:moduleKey` | settings, `key` included | edits or renames a module |
   | `DELETE .../io/modules/:moduleKey` | none | removes the module and its channels |
   | `POST .../io/modules/:moduleKey/channels` | `{ "tags": [..] }`, 1 or more | maps each tag: zone and `ioType` derived, variable derived, address proposed |
   | `PATCH .../io/channels/:tag` | `tag`, `variable`, `address`, `comment`, `module`, all optional | edits a channel |
   | `DELETE .../io/channels/:tag` | none | unmaps the tag |

   - The first `POST .../io/modules` creates the mapping. A Pantin without
     one answers `missing`.
   - Status codes:
     - 404: an unknown `:moduleKey` or `:tag` in the path;
     - 400: an invalid body, a tag the document does not have, or a
       `module` in a channel `PATCH` that does not exist;
     - 409: a tag already mapped (in a `POST`, or as the new `tag` of a
       `PATCH`), a module `key` or `port` already used by another module,
       and any mutation while the mapping is unreadable or legacy files are
       present (points 6 and 8).
     So the routes never create a duplicate.
   - A `PATCH` that carries `tag` (even unchanged) derives zone and
     `ioType` again: that is the fix for a mismatch after a document
     change. When the zone, the width or the module changes and no
     `address` is given, a new address is proposed. An explicit `address`
     is kept as sent, and an overlap shows as a problem.
   - A derived variable that collides, ignoring case, gets `_2`, `_3` and
     so on, within the 64-character limit. `pantin io init` uses the same
     function.
   - **Address rule** (pure, in core, shared with the CLI): the lowest
     address of the module's zone where the channel's width fits without
     overlap. Bit zones step by 1, register zones by 2, starting at 0.
     Since register zones only hold two-register values (Context), this
     keeps REAL and DINT on even addresses, which an `%ID` overlay would
     need. That need is NOT VERIFIED for CODESYS (ADR 0045, P6).
5. **`IoMappingResponse`**, reshaped to mirror the file:
   - `status`: `valid`, `invalid` or `missing`, as before;
   - `mappingId` (point 7);
   - `modules`: each module's settings plus `channels`. Each channel is
     annotated with the tag's `tagType`, `direction` and `owner`
     (`{kind, id}`, `kind` from `tag-entries.ts`: `joint`, `drive`,
     `sensor`, `emitter`, `presenceSensor`), all null for an unknown tag.
     The `line` field is gone;
   - `problems`: `{path, code, message}`. `path` is the JSON path into
     io.json as an array, as in a Zod issue (for example
     `["modules", 0, "channels", 3, "address"]`); `[]` means the whole
     file. `file`, `line` and `column` are gone;
   - `unmappedTags`: `{name, type, direction, owner}` instead of names.
6. **Validation.** Structural rules belong to the schema. A file that fails
   them is unreadable: `status: "invalid"`, no modules, one problem per
   issue, and the editor shows the problems and edits nothing.
   - Codes kept, now with paths: `file_too_large`, `invalid_encoding`,
     `unknown_tag`, `zone_direction_mismatch`, `type_mismatch`,
     `type_zone_mismatch`, `address_out_of_range` (now only a value whose
     width runs past 65535), `address_overlap`, `invalid_variable`,
     `duplicate_variable`.
   - Codes added: `invalid_json`, `schema_invalid` (one per Zod issue,
     which covers duplicate keys, ports and tags), `legacy_io_files`
     (point 8), and `unreadable_file` for an io.json that cannot be read
     (a directory, a symlink leading outside the folder, no permission),
     so that a broken io.json never blocks opening or discarding the
     Pantin (clarified in P1).
   - Codes removed: the 11 CSV and two-file codes of the Context,
     `modules_invalid` and `duplicate_tag`. `unknown_module` cannot happen
     any more, since channels are nested in their module.
   - Unmapped tags remain a warning. The validation functions of
     `io-validation.ts` and `io-identifiers.ts` carry over: they now work
     on channels and report paths instead of line and column.
7. **`mappingId` and `io_changed`.**
   - `mappingId` is the SHA-256 (hex) of the canonical text of the open
     mapping, which equals the bytes of io.json after a save. It is null
     when the mapping is missing or unreadable. It no longer hashes disk
     bytes, because the bridge runs on the open mapping, as it runs on the
     open document's tags.
   - `io_changed` is also sent when `mappingId` changes: any edit, a
     carried rename, or a discard. The message and `TAG_BUS_VERSION` are
     unchanged. The bridge still exits on `io_changed` and is still refused
     with 4003 on a stale id (ADR 0045 point 10).
   - So every mapping edit stops a running bridge, which must be
     restarted. The user accepted this on 2026-10-13; the backlog item
     "bridge reconnection" moves up.
8. **Legacy files: one explicit migration.**
   - `pantin io migrate <folder>` reads `io.csv` and `io-modules.json` with
     the P2 parser, which moves from core to the CLI, frozen. It writes
     io.json (refusing to overwrite one) and then deletes the two files.
   - It refuses, with `io.csv:line:column` messages, CSV syntax problems, a
     missing or invalid `io-modules.json`, a row whose module is unknown,
     and a tag mapped twice.
   - Other problems, such as unknown tags and overlaps, carry over and
     appear in the editor.
   - The core reads only io.json. It checks whether either legacy file
     exists on each `GET .../io`. If one does, the mapping is `invalid`
     with a `legacy_io_files` problem. Without io.json, the message says
     to run `pnpm pantin io migrate <folder>`. With io.json, it says to
     delete the legacy files, which io.json replaces. Two sources of truth
     are never merged.
9. **CLI on io.json.**
   - `pantin io init <folder>` writes io.json: module `m1`, port 1502,
     every tag mapped through the functions of point 4. It refuses an
     existing file unless `--update` is given. With `--update` it maps the
     unmapped tags into `m1` and rewrites the canonical file.
   - `pantin gvl` is unchanged in output. Modules come in file order and
     channels in canonical order, and an invalid mapping is still refused.
   - `pantin validate` prints `io.json: modules[0].channels[3].address:
     <message>`.
   - Like any tool that writes the folder, the CLI should not run on a
     Pantin that a core holds open with unsaved edits. Save in the core
     overwrites, as for pantin.json.
10. **Renames carry over.** This reverses ADR 0045 point 7 ("renames do not
    rewrite io.csv"), as the user chose on 2026-10-13.
    - The open Pantin keeps the document the mapping was last aligned with.
    - Each read of the mapping (route, bus, save) first applies
      `renamedTags(aligned, current)` to the channels' `tag` field, then
      records `current`.
    - One read path replaces a hook in 24 document assignments. Pairing by
      owner and member makes several edits in a row resolve correctly.
    - `variable` is never changed, so the PLC program keeps working. A
      rename only changes the bridge's view, through `io_changed`.
    - A deleted tag leaves its channel in place as `unknown_tag`, for the
      user to delete. Nothing is silently removed.
    - If a rename's new name is already the tag of a stale channel, that
      rename is not carried, and its channel shows `unknown_tag`.
11. **The viewer editor.**
    - A fourth central layout, `io` ("E/S" / "I/O"), shown alone, is
      chosen from the toolbar like the 3D and diagram views. It is
      editable in edit mode, like the rest of the document.
    - Layout: a module list on the left (key, port, channel count, problem
      count, Add). For the selected module, a settings form and a channel
      table (tag, variable, zone, address, type, comment) with inline
      editing, row deletion and Reassign (a `PATCH` with `tag`). A side
      list of unmapped tags grouped by assembly, each with "Map to
      <module>", plus "Map all".
    - Problems are marked on their cell, found through `path`, and listed
      at the top. Each item scrolls to its cell. The viewer computes
      nothing: zone, type, address and variable come from the core.
    - Links with ADR 0047: clicking a channel's tag selects its owner (a
      device row, or the joint's tree node), with the tree unfolding as in
      ADR 0047 point 4. The inspector of a device or joint gains an
      "E/S" / "I/O" section listing its tags with module, address and
      variable, or "not mapped" with a Map button. It links back to the
      `io` view. The context menu of a device row gets "Show in I/O".
    - Labels in French and English.
12. **Slices**, one agent each:
    - P0: this ADR.
    - P1, protocol and core read path: `IoDocumentSchema`, the new
      `IoMappingResponse` and problem codes; `pantin schema io` and
      `io.schema.json`; open, save and discard of io.json and
      `unsavedChanges`; validation on channels with paths; `mappingId` and
      `io_changed` on a mapping change; `legacy_io_files`; `GET .../io`.
    - P2, core write path: the routes of point 4, the shared allocation
      functions (address, variable, module key, port), rename
      reconciliation, and their tests.
    - P3, CLI: `io migrate` (the parser and its tests move out of core),
      `io init`, `gvl` and `validate` on io.json; `io-list.ts` leaves core.
    - P4, bridge: `io_mapping.py` decodes the nested
      modules and the path problems, and the fixture is regenerated.
    - P5, viewer: the `io` view with modules, table, problems and the
      unmapped list.
    - P6, viewer: the inspector section, owner selection and the tree
      context menu.
    - P7, demonstration: ADR 0045 P4's `examples/plc-cylinder` ships an
      io.json. The user builds a mapping from scratch in the viewer,
      saves, runs `pantin gvl` and starts the bridge.

## Rejected alternatives

- **Keep the CSV and add an editor on top**: two formats to keep valid and
  11 syntax codes for a file nobody edits by hand.
- **Write io.json at once on each edit**: a discarded rename leaves names
  on disk that pantin.json does not have, and the window has two save
  models (point 3).
- **A whole-file `PUT .../io`**: the viewer would compute addresses and
  variables (domain logic in the viewer, against CLAUDE.md 3.2), the CLI
  would hold a second allocator, and two viewers would overwrite each
  other's work. Kept as a possible backlog item for imports.
- **Channels keyed by index** (`.../channels/:index`): an index goes stale
  when another client inserts or sorts. The tag, unique by schema, does
  not.
- **Deriving `zone` and `ioType` instead of storing them**: shorter, but a
  document change would silently move a channel the PLC program is wired
  to (point 1).
- **Renames not carried** (ADR 0045 as it was): the user would re-map every
  renamed tag by hand, although the core now owns the file.
- **Converting legacy files automatically on open**: the core would keep
  the CSV parser and two-file rules for ever, for files nobody in the
  repository has. An explicit command is reviewable in git.
- **The bridge following only the saved mapping**: it conflicts with tags
  served from the unsaved document.
- **Mapping in pantin.json**: changes the document's public schema for PLC
  settings, and mixes a machine model with one wiring of it (ADR 0045's
  rejection, unchanged).
- **The editor in the inspector or a side panel**: a table with hundreds of
  rows needs the central area. The inspector shows only one element's
  tags (point 11).

## Consequences

- Nobody edits I/O by hand. The core owns the format, and the bridge's
  contract is still one validated answer.
- io.json is a second public schema: any change bumps `schema_version`
  with a migration (CLAUDE.md 14.6).
- An outside edit to io.json is seen only after discard or reopen, as for
  pantin.json. Today the files are re-read on every call.
- Every mapping edit stops a running bridge (`io_changed`). Commissioning
  edits mean restarting the bridge until "bridge reconnection" lands.
- ADR 0045 gets "Partly superseded by: ADR 0049", naming point 4 (the
  `io_changed` row now also covers a mapping change, point 7 here), points
  6, 7 and 9, and point 10 (the core compares the bridge's `mappingId` with
  the open mapping, not with the files on disk).
- CLAUDE.md section 5: "Liste d'E/S : un fichier io.json par Pantin (ADR
  0049), édité depuis le viewer…". Section 13.7: GVL from io.json.
  `docs/guides/pantin-document.md` gets a short io.json section.
- Backlog: `io-csv-export.md` (spreadsheet export), removing
  `pantin io migrate` and the frozen parser after a release, a whole-file
  import, and `bridge-reconnection.md`, created now as a priority item.
- No dependency is added.
- NOT VERIFIED: whether CODESYS needs even register addresses for REAL and
  DINT (point 4); every item already NOT VERIFIED in ADR 0045 (P6).

## Amendment: the GVL from the viewer (2026-10-14)

The viewer gets a button that downloads the GVL, so the user does not need
the command line to finish the P7 demonstration.

1. The pure generator moves from `packages/cli/src/gvl.ts` to
   `packages/core/src/domain/gvl.ts` (`renderGvl`), with the formatting of an
   `IoProblem` (`describeIoProblem`). `pantin gvl` calls it, and its output is
   byte for byte unchanged (`gvl-equivalence.test.ts`). The CLI already
   depends on the core, and the boundary rules allow it.
2. New route `GET /api/pantins/:pantinId/io/gvl`. For a valid mapping it
   answers 200, `text/plain; charset=utf-8`, with
   `Content-Disposition: attachment; filename="<pantinId>.gvl"`. For a missing
   or invalid mapping it answers 409 `conflict` naming the problems, as the
   command does, because a partial list would hide what must be fixed.
3. The I/O view gains an "Exporter la GVL" / "Export GVL" button. It only
   calls the route, and is enabled when the mapping it holds is valid.

Rejected alternative: generating the GVL in the viewer from `GET .../io`. It
would duplicate the generator and keep two formats to maintain, against
CLAUDE.md 3.2 (no domain logic in the viewer).

## Amendment (2026-10-19): one view selector per zone (ADR 0059)

The central layouts are replaced by a top zone and an optional bottom zone,
each with its own view selector (3D, Schéma, Liaisons, E/S), as described in
the amendment of ADR 0059 of the same date. The splitter, its stored ratio
and the render loop rule are unchanged.

## Amendment (2026-10-20): point 8 done

`pantin io migrate`, its CSV parser and the core's `legacy_io_files` problem
are removed after release 0.2.0, as point 8 planned. A folder that still holds
`io.csv` and `io-modules.json` is migrated with 0.2.0 first.

## Amendment (2026-10-20): a read-only CSV export

Some users want the mapping in a spreadsheet, to review it with an electrician
or to paste it into a wiring document. It follows the pattern of the GVL
export of the amendment of 2026-10-14:

1. The pure renderer `renderIoCsv` lives in the core
   (`packages/core/src/domain/io-csv.ts`): a header row, then one row per
   channel (module, port, unitId, tag, variable, zone, address, ioType,
   direction, comment), modules in file order and channels in canonical order.
   RFC 4180 quoting, CRLF line breaks, a comma as separator, UTF-8 with a byte
   order mark so that Excel reads accents. The separator is the one RFC 4180
   defines because the semicolon that French Excel expects is a regional
   setting that is NOT VERIFIED here; the guide says how to import with a
   comma.
   Formula guard: a comment that starts with `=`, `+`, `-`, `@`, a tab or a
   carriage return is written with a leading apostrophe, so that a spreadsheet
   shows text and does not run it. Trade-off: a comment such as `-B12` or
   `+A1-S2` (common IEC 81346 designations) would otherwise be read as a
   formula, but depending on the spreadsheet the apostrophe may show in the
   cell (NOT VERIFIED). Only the comment is guarded: tags and variables are
   checked names, the other cells are numbers or fixed words.
2. New route `GET /api/pantins/:pantinId/io/csv`, answered as `text/csv;
   charset=utf-8` with `Content-Disposition: attachment; filename="<pantinId>-io.csv"`.
   A missing or invalid mapping is refused with a 409 and its problems, as the
   GVL is.
3. `pantin io export <folder>` prints the same text, with the exit codes of
   `pantin gvl`. Both accept `--output <file>`, which writes the bytes directly:
   a `>` redirection may re-encode the file in Windows PowerShell 5.1 (NOT
   VERIFIED). The I/O view gets an "Exporter en CSV" /
   "Export CSV" button next to the GVL one, enabled by the same rule. The
   viewer holds no CSV logic.

Import stays rejected, as the "whole-file `PUT .../io`" alternative above: a
file edited in a spreadsheet and read back would bring a second source of truth.

## Amendment of 2026-10-20, by ADR 0064

The columns of the CSV export become: module, transport, endpoint, tag,
variable, direction, address, PLC type and comment (`plcType` in the header
row). The transport, endpoint, address and PLC type cells are text from the
presentation registry of `@pantin/transport-types` (for example `Modbus TCP
slave`, `port 1502, unit 1`, `coil 0`, `BOOL`), so a transport adds its own
text without changing the renderer. The rest of the amendment of 2026-10-20 stands:
RFC 4180 quoting, UTF-8 with a byte order mark, the formula guard on the
comment, and no import.
