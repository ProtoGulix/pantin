# 0064. Signals, a multi-transport io.json and PLC symbol import

- Status: accepted (user, 2026-10-20)
- Date: 2026-10-20
- Point 8 built by: ADR 0065 (one `plc` connection per transport, the OPC UA client)
- Source: spike 0012 (docs/spikes/0012-codesys-symbol-export.md)
- Partly supersedes: ADR 0049 (point 1: the file shape and its canonical
  order; point 2: version 1 as the only version; point 4: the channel
  routes; point 5: the module shape of `IoMappingResponse`; point 6: the
  problem codes; point 9: `io init` and `gvl`; the columns of the CSV
  export amendment of 2026-10-20)
- Extends: ADR 0045 point 9 (variable rules), ADR 0050 point 4 (checks
  before a spawn)
- Applies: ADR 0022 and ADR 0028 (one folder per type, here per
  transport), ADR 0038 point 3 (preview, then apply an exact list)
- Changes, with the user's consent (CLAUDE.md 14.8): CLAUDE.md section 4
  (two packages, the protocol's import exception) and section 5 (I/O list)

## Context

The user decided on 2026-10-20:

- A signal layer that does not depend on any protocol: what a PLC
  programmer sees of a Pantin, whatever carries it.
- io.json moves to a multi-protocol format now, so that adding a
  protocol later brings no format debt. Pantin is at 0.2.
- One bridge process per protocol, all spawned by the core. The Modbus
  bridge stays in Python. An OPC UA client bridge in TypeScript comes
  later (chantier 2, the OPC UA work package, its own ADR); the format
  must already fit it. Chantier 1 is this ADR, chantier 3 the fault
  injection and scenario work package.
- Signals stay derived from pantin.json: no hand-written signal file
  (CLAUDE.md 5: never a tag defined by hand in two places).
- Importing a PLC symbol list fills in the PLC-side names. It starts
  with the CODESYS Symbol Configuration XML, and the design stays open to
  other formats (TIA Portal tag tables), which are not built.

Facts checked in the repository on 2026-10-20 (`develop`):

- io.json is version 1 (`protocol/src/io-document.ts`). Its module fields
  (`port`, `unitId`, `wordOrder`, `watchdogMilliseconds`) and its channel
  fields (`zone`, `address`, `ioType`) are all Modbus fields. The schema
  forbids one tag in two channels. `examples/plc-cylinder/io.json` is the
  only committed io.json.
- The Modbus rules are spread over core: `io-rules.ts`,
  `io-allocation.ts` (`proposeAddress`, `smallestFreePort`),
  `io-validation.ts`, `io-document-text.ts` (channels sorted by zone),
  `gvl.ts` and `io-csv.ts`. `IO_PROBLEM_CODES` (`protocol/src/
  io-mapping.ts`) mixes common and Modbus codes.
- `readIoDocument` parses with `z.literal(IO_SCHEMA_VERSION)`, which is 1, and io.json has no
  migration chain. pantin.json has one (`core/src/domain/migrations.ts`).
  `savedIoText` is the canonical text of what was read
  (`service/open-pantins.ts`), and save writes io.json only when that
  text changed (ADR 0049 point 3). A file migrated on read would
  therefore never be rewritten.
- `tag-entries.ts` gives each tag its owner, type and direction, but no
  unit. The units are in two places: the joint coordinate unit
  (`JointCoordinateUnit`: metre, radian or null) and the `quantity` of
  drive tags (`position`, `speed`, `percent`; drive-types
  `schema-common.ts`). The viewer works out a drive's unit itself
  (`viewer/src/actuators/actuator-joints.ts`, `driveCoordinateUnit`).
- The bridge reads `GET .../io`, never the file
  (`bridge/src/pantin_bridge/io_mapping.py`). It checks problem codes
  against a set it knows.
- The bus accepts one `plc` connection per Pantin (4002,
  `bus/bus-hello.ts`). `plc_status.module` is a module key.
- `.dependency-cruiser.cjs` lets the protocol import only the schemas of
  drive-types, actuator-types and sensor-types.
- JSON request bodies are at most 64 KiB (`http/request-reading.ts`).
- No workspace package depends on an XML parser. Node's standard library
  has none (NOT VERIFIED against the documentation of the pinned Node
  version, recalled: no `DOMParser` in Node).
- Zod is 4.6.5 (`protocol/package.json`). Whether its discriminated
  unions accept a nested discriminator (`transport.kind`) is NOT
  VERIFIED, so point 4 does not rely on it.
- Spike 0012: the symbol XML has the root `Symbolconfiguration` in the
  namespace `http://www.3s-software.com/schemas/Symbolconfiguration.xsd`,
  and the sections `Header`, `TypeList` and `NodeList`. Only leaf nodes
  carry `type` and `access`, and the path is the chain of node names. It
  holds no Modbus address. Seen in one real file (CODESYS 3.5.12) only:
  `access="ReadWrite"` and no comments. Every other access spelling, the
  comment element, the XSD, the SP18+ "IEC Symbol Set" and other versions
  are NOT VERIFIED.
- CLAUDE.md 4 and `docs/backlog/opc-ua.md` still plan OPC UA as asyncua
  in the Python bridge. Chantier 2's ADR changes this, and the asyncua
  wording of CLAUDE.md 4 (stack, item 3) with it. This ADR only keeps the
  format open.

## Decision

1. **Terminology.**
   - A *signal* is the static definition of a tag: its name, type,
     direction, unit and owner. It is what a PLC programmer reads. User
     guides say "signal" (French "signal"), with "tag" given once in
     brackets.
   - A *tag* is the same name at run time, with a value. The code keeps
     `tag` everywhere it is today: the tag bus, forcing, `TagSchema`, and
     the `tag` field of a channel. Nothing is renamed. Only the new
     definition contract says `signal`.
2. **Signal contract** (`protocol/src/signal.ts`).
   - `GET /api/pantins/:pantinId/signals` answers `{ signals: Signal[] }`
     for the open document, unsaved edits included, in `tagEntries`
     order.
   - `Signal` is `{ name, type, direction, unit, owner: { kind, id, name
     }, member, description }`.
   - `unit` is one of `metre`, `radian`, `metre_per_second`,
     `radian_per_second`, `percent`, `none` (bits, counts) and `unknown`
     (a servo drive that feeds no actuator yet). It is derived by a pure
     `core/src/domain/signals.ts`:
     - a joint's tags take its coordinate unit;
     - a drive tag with `quantity: position` takes the unit of the joints
       its actuators move (one unit, ADR 0028 point 6), and with `speed`
       that unit per second;
     - `percent` gives `percent`;
     - sensor, encoder, emitter and presence tags give `none`.
   - `owner.name` is the element's `name`, or its id when the element has
     none.
   - `description` is English text built from the owner and the English
     member label, for example `Drive "Vérin 1": coil 14`. The viewer
     shows its own labels and ignores this field.
   - Values stay SI and are never scaled (ADR 0045 point 8).
   - `pantin signals <folder> [--json]` prints the same list from the
     folder, as a table or as JSON.
   - The viewer may later read units from here instead of
     `driveCoordinateUnit` (not required by this ADR).
3. **One folder per transport: `@pantin/transport-types`.** It follows
   ADR 0022 and ADR 0028 and depends on Zod only.
   - `src/<kind>/` holds:
     - `schema.ts`: the module transport object, the channel object and
       the transport's problem codes, as data;
     - `rules.ts`: pure validation, the choice of zone and type,
       `proposeAddress` and port allocation;
     - `labels.ts`: French and English labels, typed after the schema;
     - `presentation.ts`: pure text for the endpoint, the channel address,
       the CSV cells and the GVL type and comment.
   - Registries: `schemas.ts`, `rules.ts`, `labels.ts`,
     `presentation.ts`. Shared plain types are in `schema-common.ts`, for
     example the signal shape as string literals, as drive-types does.
   - Import rules, enforced by dependency-cruiser:
     - the protocol imports `schemas.ts`, `schema-common.ts` and
       `<kind>/schema.ts` only;
     - the core imports the rules and the presentation;
     - the viewer imports the schemas, labels and presentation, never
       `rules`;
     - the schema files never reach `rules`, directly or through other
       imports.
   - The core dispatches through the registry and never names a kind.
     Adding a protocol means one folder, one line per registry and one
     bridge. A guide `docs/guides/adding-a-transport.md` describes it.
   - The first folder is `modbus-tcp-slave/` (kind `modbus_tcp_slave`).
     The Modbus code moves into it from `io-rules.ts`,
     `io-allocation.ts`, `io-validation.ts`, `io-csv.ts` and `gvl.ts`.
   - The kind names the role (slave). CLAUDE.md 10.2 keeps both roles
     possible: a later `modbus_tcp_master` reuses the `modbus` channel
     object, and chantier 2 adds `opcua_client` with an `opcua` channel
     object (not defined here).
4. **io.json version 2.**
   - A module is `{ key, transport, channels }`.
     - `transport` is `{ kind, ...settings of the kind }`. The watchdog
       moves into it, because "no request for N ms" is a Modbus slave
       notion; the core's reaction to `plc_status` stays common.
     - Module keys are unique across all modules (`plc_status.module`
       names them).
   - A channel has common fields and one sub-object for its transport:
     - common: `tag`, `variable`, `comment`;
     - the sub-object named by the transport, `modbus` for
       `modbus_tcp_slave`: `{ zone, address, ioType }`.
   - The schema is a union of the transport objects on `kind`. A
     `superRefine` checks that each channel carries exactly its module's
     sub-object and no other. The JSON Schema export drops that rule, as
     it drops the other cross-field rules (ADR 0045 point 4).
   - Canonical text:
     - modules in file order;
     - channels sorted by the transport's key (Modbus: zone, address,
       tag);
     - keys in the order `tag`, `variable`, `comment`, then the
       sub-object;
     - 2-space indentation and a final newline, as before.
   - plc-cylinder in version 2, shown compacted (the canonical text is
     `JSON.stringify(document, null, 2)`):

         { "schema_version": 2,
           "modules": [ { "key": "m1",
             "transport": { "kind": "modbus_tcp_slave", "port": 1502,
               "unitId": 1, "wordOrder": "low_word_first",
               "watchdogMilliseconds": 1000 },
             "channels": [
               { "tag": "verin1.verin1.coil_14",
                 "variable": "verin1_verin1_coil_14", "comment": "",
                 "modbus": { "zone": "coil", "address": 0,
                   "ioType": "BOOL" } },
               { "tag": "verin1.verin1.coil_12",
                 "variable": "verin1_verin1_coil_12", "comment": "",
                 "modbus": { "zone": "coil", "address": 1,
                   "ioType": "BOOL" } },
               { "tag": "tige.verin-min.state",
                 "variable": "tige_verin_min_state", "comment": "",
                 "modbus": { "zone": "discrete_input", "address": 0,
                   "ioType": "BOOL" } },
               { "tag": "tige.verin-max.state",
                 "variable": "tige_verin_max_state", "comment": "",
                 "modbus": { "zone": "discrete_input", "address": 1,
                   "ioType": "BOOL" } },
               { "tag": "tige.verin.position",
                 "variable": "tige_verin_position", "comment": "",
                 "modbus": { "zone": "input_register", "address": 0,
                   "ioType": "REAL" } } ] } ] }

5. **Validation**, pure, against the open document. The common rules are
   in `core/src/domain/io-validation.ts`; each transport's rules are in
   its folder and return paths relative to the module.
   - Common rules:
     - the structural codes: `file_too_large`, `invalid_encoding`,
       `invalid_json`, `unreadable_file`, `schema_invalid`, and
       `newer_schema_version` for a version above 2 ("written by a newer
       Pantin");
     - `unknown_tag`;
     - `command_mapped_twice`: a command is in at most one channel across
       all modules of all transports. A feedback may be in several
       modules (one Modbus and one OPC UA module, for example), but once
       per module, a schema rule;
     - `unsupported_signal`: a (type, direction) pair the transport
       cannot carry; none for Modbus;
     - `listen_port_used_twice`, for every transport whose module listens;
     - `invalid_variable` and `duplicate_variable`: two channels of
       different tags with the same variable, ignoring case. The same tag
       on two modules may share its variable.
   - Modbus rules, unchanged in meaning: `zone_direction_mismatch`,
     `type_mismatch`, `type_zone_mismatch`, `address_out_of_range`,
     `address_overlap`.
   - `IoProblemCode` is the common codes plus the codes of every
     transport's `schema.ts`. Unmapped signals (in no channel at all)
     stay a warning.
6. **Routes and answer.**
   - `IoMappingResponse` mirrors version 2: modules with `transport`, and
     channels with their sub-object plus `tagType`, `direction` and
     `owner`. `mappingId` keeps its definition.
   - Changed routes:

     | Route | Body |
     | --- | --- |
     | `POST .../io/modules` | `{ key?, transport: { kind, ...optional settings } }` |
     | `PATCH .../io/modules/:moduleKey` | `{ key?, transport?: settings of the same kind }`; another `kind` is 400 |
     | `POST .../io/modules/:moduleKey/channels` | `{ tags }`, as before |
     | `PATCH .../io/modules/:moduleKey/channels/:tag` | `tag`, `variable`, `comment`, `module`, transport sub-object (`modbus: { address }`), all optional |
     | `DELETE .../io/modules/:moduleKey/channels/:tag` | none |
     | `POST .../io/variables` | `{ assignments: [{ module, tag, variable }] }`, point 13 |

   - `.../io/channels/:tag` is removed, since a feedback may now be in
     two modules. It is not deprecated first (0.2).
   - A channel moved to a module of another kind gets its sub-object
     derived again.
   - 409 rules: a tag already in this module, a command already mapped
     anywhere, a key or listen port already used.
   - `pantin io init [--transport <kind>]` uses the same functions,
     `modbus_tcp_slave` by default.
   - `pantin schema io` regenerates `protocol/schema/io.schema.json`.
7. **Migration from version 1 to 2**, the first io.json migration chain.
   - It lives in `core/src/domain/io-migrations.ts`, one pure function per
     step, as `migrations.ts` does for pantin.json.
   - `migrateIoV1ToV2` moves `port`, `unitId`, `wordOrder` and
     `watchdogMilliseconds` into `transport` with `kind:
     "modbus_tcp_slave"`, and `zone`, `address` and `ioType` into
     `modbus`.
   - `readIoDocument` applies the chain before the schema, so the
     problems of a version 1 file point into the migrated shape, flagged
     "migrated from version 1".
   - A migrated reading carries `migratedFrom: 1`. Save writes io.json
     when its text changed or the reading was migrated, so the file
     reaches version 2 at the next save. `unsavedChanges` does not turn
     true on open.
   - `pantin validate`, `gvl` and `io export` read both versions through
     the same function. `pantin io init --update` writes version 2.
   - The migration changes `mappingId`, since the canonical text changes.
     A running bridge then gets `io_changed` and restarts, the existing
     path (ADR 0049 point 7, ADR 0050 point 7).
8. **Bridges and bus: now versus chantier 2.**
   - Now:
     - still one Modbus bridge per Pantin and one `plc` connection.
     - The bridge decodes the version 2 answer of `GET .../io`. It keeps
       the modules whose `transport.kind` is `modbus_tcp_slave` and skips
       the others with an INFO line, so it never fails on a kind it does
       not know.
     - Its `ready` line lists only its own modules.
     - `io-mapping-responses.json` is regenerated, and pytest decodes it
       (ADR 0045 point 2).
     - The supervisor (ADR 0050 point 4) refuses a start with 409 when
       io.json has no `modbus_tcp_slave` module, and checks ports on
       those modules only.
     - The bus, `TAG_BUS_VERSION` and `plc_status` do not change.
   - No per-transport projection route now. One answer and one fixture
     are enough while one bridge exists.
   - Chantier 2 (OPC UA client), its own ADR:
     - one `plc` connection per transport, with `hello` naming its
       transport (a bus version bump);
     - a `mappingId` per transport, so that an OPC UA edit does not
       restart the Modbus bridge;
     - `BridgeStatus` per transport;
     - one spawn command per kind.
     None of these needs a change to io.json version 2.
9. **PLC variable references.**
   - `variable` is a dotted IEC reference: 1 to 8 identifiers joined by
     `.`, each following the ADR 0045 point 9 rules, at most 255
     characters in total.
   - A one-identifier variable is declared by the GVL Pantin generates,
     as today.
   - A dotted variable (`GVL_IO.Verin1.FinCourseSortie`, `PLC_PRG.ok`)
     names something the PLC program declares already. The generated GVL
     leaves it out and lists it in its header comment.
   - So `Verin1.FinCourseSortie` is possible on the PLC side, while the
     signal name keeps its contract (point 15).
   - NOT VERIFIED: that the CODESYS I/O mapping of a Modbus slave channel
     accepts such a reference, struct members included.
10. **The PLC symbol model** (`@pantin/plc-symbol-formats`, Zod only).
    - The neutral model is `PlcSymbol { path: string[], iecType, access,
      comment }`:
      - `path` holds the segments from the root, the application first;
      - `iecType` is the IEC text (`BOOL`, `ARRAY [0..10] OF INT`,
        `Point`);
      - `access` is `read`, `write`, `read_write` or `unknown`;
      - `comment` is a string or null.
    - A format is `PlcSymbolFormat { id, detect(text): boolean,
      parse(text): PlcSymbolList | ParseProblem[] }`. Formats are one
      folder each, listed in a `formats.ts` registry. Only the core
      imports the package; the protocol and the viewer never do.
    - One format: `codesys-symbolconfiguration/`.
      - `detect` checks the root element name and the namespace URI.
      - `parse` walks the `NodeList`, joins the node names into the path,
        and resolves `type` through `TypeList` to its `iecname`.
      - It expands `TypeUserDef` structures into one symbol per element,
        recursively, up to 8 levels. Arrays are listed as unsupported.
      - It maps `ReadWrite` to `read_write`, and any other spelling to
        `unknown`, with a warning, until a real file shows it.
      - It reads comments only once their element is known.
      - `ProjectInfo` is returned for display only.
    - A TIA Portal folder is not built. SimaticML carries an absolute
      address (spike 0012); the model leaves room for an optional
      `address` later.
    - **Blocker:** the parser is written only after the user exports a
      real file into `private/` (spike 0012, "What a follow-up would
      need"): a GVL with BOOL, INT and REAL, a structure, a comment and a
      read-only variable.
    - Symbols are never stored. They exist only between the preview and
      the apply, inside the request that carries them. A stored copy
      would be a second source of truth that goes stale with the PLC
      project.
11. **Reading the XML: a hand-written subset reader.**
    - `src/xml-subset.ts`, pure, shared by later XML formats. It reads
      the XML declaration, elements, attributes, self-closing tags, text,
      CDATA, comments, the 5 predefined entities and character
      references.
    - It refuses DOCTYPE (so no external or expanding entities),
      processing instructions other than the declaration, and any
      encoding but UTF-8 (a BOM is skipped).
    - Limits: depth 64, 200 000 elements, 50 000 symbols, text at most
      8 MiB.
    - Its tree is checked by Zod before the format reads it (CLAUDE.md 8).
    - The alternative is `fast-xml-parser`: a dependency to approve
      (CLAUDE.md 8 hygiene 2), with its licence (MIT, recalled), its
      entity handling and its advisories all NOT VERIFIED. The subset
      needs no dependency and refusing DOCTYPE removes the entity attack
      surface. The user chose the hand-written reader on 2026-10-20;
      the library is not added.
12. **Matching and type compatibility** (`core/src/domain/
    symbol-matching.ts`, pure).
    - Candidates are the channels (an import names PLC variables, so
      only mapped signals take part). A symbol's reference is its path
      without the application segment.
    - Rules, in order. Each matches only when it is unique on both sides:
      1. exact: the last segment equals the channel's current `variable`,
         ignoring case. The result is `unchanged` and is never rewritten,
         so a symbol of the GVL Pantin generated stays as it is;
      2. normalised: lower case with `_` removed, equal to the variable
         derived from the tag (`deriveVariable`);
      3. suffix: normalised, equal to `<tag key><member>`.
    - Anything else is unmatched. Ambiguous cases list their candidates,
      and the user picks.
    - Common compatibility table (signal type and IEC type):

      | Signal | Compatible | With a warning |
      | --- | --- | --- |
      | bit | BOOL | none |
      | float | REAL, LREAL | none |
      | integer | DINT, LINT | INT, SINT, UDINT, UINT, USINT, ULINT, BYTE, WORD, DWORD, LWORD (range, sign) |

      Any other type (STRING, TIME, arrays, structures) is incompatible
      and never proposed.
    - Transport rules add their own:
      - Modbus warns when the IEC type differs from the channel's
        `ioType` (an LREAL variable behind a REAL channel) and ignores
        `access`;
      - an OPC UA client will require `read` for commands and `write` for
        feedback.
13. **Preview and apply.**
    - `POST .../io/symbols/preview[?format=<id>]`:
      - the body is the file, `application/xml` or `text/xml`, at most
        8 MiB, read by its own body reader; the 64 KiB JSON limit stays;
      - without `format`, the first format whose `detect` is true is used,
        else the answer is 400 with the known ids;
      - it answers `SymbolImportPreview`: `format`, `project`,
        `symbolCount`, then `proposals` (module, tag, current and
        proposed variable, symbol, rule, compatibility, warnings),
        `unchanged`, `unmatchedSignals` (with candidates) and
        `unusedSymbols` (with a reason);
      - it changes nothing.
    - `POST .../io/variables`:
      - it applies an exact list of assignments;
      - body at most 1 MiB, 4 000 entries;
      - each entry is checked again: the channel exists, the variable is
        valid. An entry that fails goes to `skipped` with a reason and
        the others still apply (ADR 0038 point 3);
      - it answers `IoMappingResponse` plus `applied` and `skipped`;
      - it is an unsaved edit. One batch changes `mappingId` once, so a
        running bridge restarts once.
    - `pantin io import-symbols <folder> <file> [--format <id>] [--apply]
      [--accept-warnings]`:
      - prints the preview;
      - `--apply` writes the compatible proposals (the warnings too with
        `--accept-warnings`) to a version 2 io.json;
      - same caution as ADR 0049 point 9 for a Pantin that a core has
        open.
14. **Viewer.**
    - The I/O view groups channels by module. Each heading has a text
      subtitle, for example "Modbus TCP esclave · port 1502 · unité 1",
      taken from the transport's labels and presentation.
    - Modbus columns (zone, address, type) show only in Modbus modules.
      The common columns (signal, unit, variable, comment) are in every
      module.
    - Module and channel edits follow point 6.
    - "Importer des symboles API…" / "Import PLC symbols…" opens a file
      picker, then a prompt with headed sections and their counts:
      matched, to check (warnings), unchanged, unmatched signals and
      unused symbols. Each row has a checkbox, and unmatched signals
      have a symbol picker. Apply sends exactly the checked rows.
    - Every state has a word or an icon with text; colour is never the
      only cue (the user is colour blind). The viewer computes no match
      and no type check.
    - French and English labels.
15. **Signal names keep their contract**: `<assembly>.<tag key>.<member>`
    (`TagNameSchema`, ADR 0019). PLC names live in `variable` (point 9).
16. **Tests.**
    - protocol: version 2 schema cases (sub-object mismatch, a feedback
      twice in one module); the freshness of `io.schema.json`; signal and
      preview fixtures.
    - transport-types: Modbus rules moved with their tests; a registry
      test (every kind has a schema, rules, labels and presentation).
    - core:
      - each unit derivation;
      - migration version 1 to 2 on the plc-cylinder text, read and then
        saved, byte for byte;
      - `newer_schema_version`, `command_mapped_twice`, and a feedback in
        two modules;
      - the routes, including 400 on a kind change;
      - matching, every rule and ambiguity;
      - the compatibility table;
      - preview and apply, partial skips, and one `io_changed` per batch.
    - plc-symbol-formats: reader limits and refusals (DOCTYPE, an entity,
      UTF-16, depth); the EMQX sample of spike 0012 and the user's real
      file as fixtures.
    - CLI: `signals`, `import-symbols` with and without `--apply`, and
      `gvl` with dotted variables.
    - bridge: decoding version 2, skipping an unknown kind; the closed
      loop test (ADR 0045 P4) still green.
    - viewer: view models for module grouping and the import prompt.
17. **Documentation.**
    - User guide in French and English (ADR 0051):
      - the I/O page (modules by protocol, signals, units);
      - a tutorial: export the symbols from CODESYS (Symbol Configuration,
        Build > Generate Code, then `<project>.<device>.<application>.xml`
        in the project folder), import them into plc-cylinder, apply, then
        regenerate the GVL, which leaves out the program's own variables.
        Guides say "logiciel de CAO", never a CAD brand.
    - Also: `docs/guides/adding-a-transport.md`,
      `docs/guides/pantin-document.md` (io.json version 2), the CHANGELOG
      under "Changed", noting that version 1 files migrate on read.
18. **Slices**, one agent each:
    - S0: this ADR and the consents listed below; the user's real symbol
      export in `private/`, which only S3 needs.
    - S1, signals: `signal.ts`, `signals.ts`, the route and `pantin
      signals`. It can run in parallel with S2.
    - S2, transport layer: `transport-types` with `modbus-tcp-slave/`,
      version 2 and its migration, validation, routes, the answer, GVL
      and CSV, the CLI, the bridge decoder and fixture, the supervisor
      check, and plc-cylinder migrated. Then the viewer: the I/O view by
      module.
    - S3, symbol import: `plc-symbol-formats`, the reader, the CODESYS
      format, matching, preview and apply, the CLI, then the viewer
      prompt. It needs S2 and the real file.
    - S4: doc-writer after each slice visible to the user, and the
      tutorial after S3; the reviewer before each squash.
    - CLAUDE.md is amended by the slice that creates what it describes:
      - S2: section 4 (the `transport-types` package, the dependency rule,
        the protocol's exception extended to the `transport-types`
        schemas) and section 5 (the I/O list paragraph: io.json carries
        modules per transport);
      - S3: section 4 (the `plc-symbol-formats` package, imported only by
        the core).

## Rejected alternatives

- **Transports inside protocol and core as a discriminated union**:
  - fewer packages, but each protocol would touch the schema, the
    validation, the allocation, the GVL, the CSV and the viewer columns
    in shared files;
  - that is the FactoryForge friction CLAUDE.md 3.3 names, and the
    opposite of the user's "no debt when a protocol is added".
- **Keep io.json version 1 and add OPC UA fields later**: Modbus fields at
  module level would become optional or meaningless for other kinds, a
  migration postponed into the chantier that has the least room for it.
- **A hand-written signal file**: defines tags twice (CLAUDE.md 5).
- **Free signal names (`Verin1.FinCourseSortie` as the tag)**:
  - the name is a public contract: tag bus, REST, forces, io.json keys,
    console history, tests, ADR 0019 rename carrying;
  - free names need uniqueness rules, a rename path and a schema bump of
    pantin.json;
  - the PLC name belongs to the PLC program and goes in `variable`
    (point 9), which already survives renames (ADR 0049 point 10).
- **A projection of the mapping per bridge now**: a second route and
  fixture for one bridge. It comes with chantier 2's per-transport
  `mappingId`.
- **Storing imported symbols in the Pantin folder**: they go stale with
  the PLC project and become a second source of truth.
- **Transport-specific channel fields at the top level of the channel**
  (`zone` beside `tag`): collisions between transports, and an unclear
  owner for each field.
- **One package for transports and symbol formats**: two independent
  axes (wire protocol, vendor file). Vendors and protocols combine
  freely.
- **fast-xml-parser now**: point 11.
- **Matching on the full path only**: a GVL rename in the PLC project
  would unmatch everything. The last segment with uniqueness is
  enough, and the user picks the rest.

## Consequences

- Consents given by the user on 2026-10-20 (CLAUDE.md 14.8): io.json
  schema version 2 (a public schema); CLAUDE.md 4 (two packages; the
  protocol's exception extended to the `transport-types` schemas;
  `plc-symbol-formats` imported only by core) and 5 (io.json carries
  modules per transport), amended by S2 and S3 (point 18); the kind name
  `modbus_tcp_slave` instead of the suggested `modbus_tcp`; the
  hand-written XML reader. None is still open. Still missing: the user's
  real symbol export, which only S3 needs.
- Amendments, appended only. The header lines below are appended with
  this ADR; the text of the ADR 0049 CSV amendment comes with S2:
  - ADR 0049: "Partly superseded by: ADR 0064" (the points of the
    header), and its CSV export amendment: the columns become module,
    transport, endpoint, tag, variable, direction, address, PLC type and
    comment, with transport text from the presentation registry.
  - ADR 0045: "Extended by: ADR 0064" (point 9, dotted variables).
  - ADR 0050: "Extended by: ADR 0064" (point 4: start only with a Modbus
    module; ports of Modbus modules only).
  - ADR 0022 and ADR 0028: "Pattern applied by: ADR 0064".
  - `docs/backlog/opc-ua.md`: points to chantier 2 and to this ADR.
- Packages and files touched:
  - new: `packages/transport-types`, `packages/plc-symbol-formats`;
  - protocol: `io-document.ts`, `io-mapping.ts`, `io-requests.ts`,
    `signal.ts`, `symbol-import.ts`, `schema/io.schema.json`, fixtures;
  - core domain: `io-*.ts`, `io-migrations.ts`, `signals.ts`,
    `symbol-matching.ts`, `gvl.ts`, `io-csv.ts`;
  - core service and http: io operations, routes, body reader, bridge
    checks;
  - cli: `signals`, `io import-symbols`, `io init`;
  - bridge: `io_mapping.py`, `bridge.py` and its tests;
  - viewer: the I/O view, the import prompt, labels;
  - `.dependency-cruiser.cjs`, knip, `tests/workspace-conventions.test.ts`,
    `examples/plc-cylinder/io.json`;
  - docs: `docs/site`, `docs/guides`, CHANGELOG.
- Backlog: a GVL option that omits declared variables (other than by
  dotted names); a TIA Portal format; the CODESYS I/O mapping CSV once a
  real file exists (spike 0012 point 3).
- NOT VERIFIED: every gap of spike 0012 (access spellings, comment
  element, XSD, SP18+ format, other versions and runtimes, empty
  namespaces, which may make a program variable look one-segment and be
  declared again by the GVL); dotted references in the CODESYS I/O
  mapping; Zod 4 nested discriminators; Node having no XML parser;
  fast-xml-parser's licence and behaviour; typical symbol file sizes
  behind the 8 MiB cap.

## Amendment of 2026-10-21: what a real SP22 export showed

Spike 0012 ("Real export, 2026-10-21") read a symbol file exported by CODESYS V3.5 SP22
Patch 1. It refines point 10 and replaces some of its NOT VERIFIED items. Point 10 above
is left as written.

- **SP22 still writes the `Symbolconfiguration` format**, in the same namespace
  (`http://www.3s-software.com/schemas/Symbolconfiguration.xsd`). `Header/Version` is the
  format version (3.5.14.0), not the product version. The deprecation notice of the
  classic symbol configuration (spike 0012 point 1) did not change the file.
- **Access.** The spellings seen are `Read` and `ReadWrite`. `Read` maps to `read`,
  `ReadWrite` to `read_write`. Any other spelling (`Write` included, which stays NOT
  VERIFIED) maps to `unknown` with one warning per spelling. A node or member with no
  access attribute is `unknown` without a warning. The access of a read-only node is
  inherited by the members it expands into.
- **Comments** are a child `<Comment>` element, on a `Node` and on a `UserDefElement`.
  The text starts with a space and may span several lines: it is trimmed at both ends and
  its newlines stay.
- **Containers.**
  - A `Node` without `type` is a container of the tree (application, GVL, program); a
    typed `Node` is a variable.
  - A function block instance is opened like a structure: `TypeUserDef` with
    `pouclass` `STRUCTURE` or `FUNCTION_BLOCK` lists its members as `UserDefElement`
    (`iecname`, `type`, `vartype`, `access`, `inherited_from`), recursively up to 8
    levels. A derived function block already lists the members it inherits, so its
    `basetype` is never walked. The container itself is not a symbol, only its leaves are
    (`PLC_PRG.fbVerin1.xBobine14`). A container nested deeper than 8 levels is listed as
    one symbol, with a warning.
  - A `TypeUserDef` with `typeclass="Enum"` has `UserDefElement` entries that are values,
    not members: the symbol's `iecType` is the enumeration's name, which the type table
    treats as incompatible.
  - Pointers (`POINTER TO ...`, `RTS_IEC_HANDLE`) and `TYPE_REFERENCE` are never opened and
    are incompatible. Arrays are listed with their `ARRAY [..] OF ...` text and never
    opened.
  - An alias type (`XWORD`, `aliasediecname="LWORD"`) uses its own `iecname`, and the model
    notes the alias in an optional `aliasOf`.
- **Direct address.** A node of the I/O mapping globals carries `directaddress="%IW1"`.
  The model keeps it as the optional `directAddress` of `PlcSymbol` (point 10 left room
  for an address). It is display only and never takes part in a match.
- **Model and results.** `PlcSymbol` gains the optional `aliasOf` and `directAddress`; the
  format's list carries `project` (display only) and a list of warnings; `parse` answers
  `{ ok: true, list }` or `{ ok: false, problems }` rather than a union with an array.
- **Preview.** Proposals and unchanged entries share one shape. A match to an
  incompatible type is shown with the compatibility `incompatible` and is never applied. A symbol whose
  reference is not a valid variable (point 9) takes no part in matching and is listed
  as unused with the reason `invalid_reference`. The exact rule compares the end of the
  reference with the whole current variable, so a dotted variable matches a dotted
  reference.
- **Still NOT VERIFIED**: the spelling of a write-only access, other CODESYS versions,
  the IEC Symbol Set Configuration (SP18+), TIA Portal, and whether the CODESYS I/O
  mapping accepts a dotted reference (point 9).

### Further decisions of the same day, after review

- **Apply and conflicts.** `POST .../io/variables` also refuses an entry whose variable another
  tag would hold (case-insensitive; the same tag in two modules may share it). The check is
  on the final state of the batch, so two signals can swap their variables. A refused entry gets
  its old variable back, which is checked again, so a clash can cascade. A channel named twice
  in one batch counts once: the second entry is skipped.
- **CLI.** `pantin io import-symbols --apply` exits 1 when any entry was skipped.
- **Suffix rule (point 12, rule 3)** is read as: the symbol's last segment ends with
  `<tag key><member>`, at a boundary. Each trailing run of the `_`-separated parts of the last
  segment is a key (`verin1_verin_min_state`: `verin1verinminstate`, `verinminstate`,
  `minstate`, `state`), normalised as in rule 2, and it is compared with the normalised
  `deriveVariable("<tag key>.<member>")`. It stays unique on both sides. A CamelCase name
  gives no boundary: only the whole name can match. So `tige.verin-min.state` finds
  `GVL.verin1_verin_min_state`.
- **Limits against hostile files.** The reader refuses raw control characters other than tab,
  line feed and carriage return, and more than 256 attributes on a tag. The expansion of types
  counts every variable it visits, symbol or not, and refuses a file that needs more than
  500 000 visits (`too_many_symbols`), so empty containers cannot fan out unboundedly.
- **No EMQX fixture.** The sample of spike 0012 is not in the repository and was not
  downloaded; the real SP22 file and a hand-made one are the fixtures.
- **Synchronous parsing.** The file is read on the core's event loop (about 0.8 s at 7 MiB,
  measured in review). That is accepted for a localhost user action; a worker thread is in
  the backlog (`docs/backlog/symbol-parsing-worker-thread.md`).

## Amendment of 2026-10-22, translatable warnings

Point 13 sent warnings and refusal reasons as English sentences, which the French viewer showed
as they came. Each one is now `{code, values, message}`: `code` from a closed list
(`SYMBOL_WARNING_CODES`, which includes each transport's `symbolWarnings` codes, and
`SKIP_REASON_CODES`), `values` the strings the sentence interpolates, `message` the English
sentence the CLI prints. The viewer translates the code; a code without a label falls back to `message`.
The codes are a closed list, so a core with new codes needs a matching viewer. The symbol import fixture moves to version 2. No decision changes.
