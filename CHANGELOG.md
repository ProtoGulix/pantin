# Changelog

All notable changes to Pantin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[SemVer](https://semver.org/). Branches and releases: ADR 0044.

## Unreleased

### Added

- Viewer, PLC bridge bar (ADR 0050 slice P3): the top of the I/O view, in view
  and edit modes, shows the bridge state (Arrêté, Démarrage…, En marche,
  Arrêt…, En échec), the network choice ("Local uniquement" or "Réseau privé"
  with the core's listen choices and an allow list, both locked while it
  runs), Start, Stop and Restart (which reuses the last network), a line per
  module with whether the PLC is connected, a translated headline per failure
  kind with the bridge's message and a folded log, and the reasons why it
  cannot be started (core without `--bridge-python`, external bridge). It
  follows the `bridge` event of the pose stream, validated with the protocol
  schema; the core's 400 on the address or allow list is shown under the
  fields. File > Close now asks when the bridge is starting or running, says
  it keeps running, and offers "Arrêter le pont et fermer".
- Core, supervised PLC bridge (ADR 0050 slice P2): `--bridge-python <python>`
  lets the core start and stop one bridge per Pantin, with `GET` and `PUT
  /api/pantins/:pantinId/bridge` (`{running: true, listen, allow}` or
  `{running: false}`; 403 under `X-Pantin-Exposure: cloudflare`, API error
  `bridge_unavailable` without the flag). A pure state machine and pure
  pre-spawn checks (listen address, allow list, mapping, slot, ports, cap of
  4) sit behind a process adapter that reads the bridge's status lines with a
  Zod schema, starts it with a fixed argument array and `shell: false`, and
  stops it with SIGTERM then SIGKILL after 3 s. The status reaches the viewer
  as a `bridge` event of the pose stream, with `plcConnected` per module; a
  failure is logged in the console as `bridge_failed`. `main.ts` closes the
  core, hence its bridges, on SIGINT and SIGTERM, and `pnpm serve` passes the
  bridge venv. Tests read `PANTIN_BRIDGE_PYTHON`.
- Bridge, `--status-lines` and SIGTERM (ADR 0050 slice P1): with the flag the
  bridge writes a `ready` JSON line on stdout once every Modbus slave is
  bound, and an `exiting` line with a `kind` before a non-zero exit;
  SIGTERM (the only signal the core sends) now stops the slaves, closes the
  bus and exits 0; SIGINT still exits 130 with no line. `RestartRequiredError`
  is split into `MappingChangedError` and `BusClosedError`. The lines are held
  by the new shared fixture `packages/protocol/fixtures/bridge-status-lines.json`.
- Example `examples/plc-cylinder` (ADR 0045 slice P4, ADR 0049 slice P7): a
  5/2 double solenoid valve, a double-acting cylinder and two limit switches
  on three vendor meshes (STEP ID1S0400125E, redistribution confirmed by the
  project owner), with an `io.json` of five channels on one Modbus module.
  Its closed loop test, `packages/bridge/tests/test_closed_loop.py`, runs in
  `pnpm check`: the real core, the real bridge, and a pymodbus client polling
  every 20 ms through 5 extend and retract cycles, checking the order of the
  switch edges.
- Viewer, "Exporter la GVL" / "Export GVL" in the I/O view (ADR 0049
  amendment): downloads the file of `GET .../io/gvl`, in view and edit modes.
  Disabled with a tooltip while the mapping is unread, missing or invalid; a
  refusal of the core shows its problems in the message line. The file
  follows the mapping shown, unsaved edits included.
- Core, `GET /api/pantins/:pantinId/io/gvl` (ADR 0049 amendment): the CODESYS
  GVL of the open mapping as a text download, 409 when the mapping is missing
  or invalid. The generator moved from the command line to the core, and
  `pantin gvl` prints the same text as before.
- Viewer, links between the I/O view and the tree (ADR 0049 slice P6):
  clicking (or Enter on) a tag in the channel table or the unmapped list
  selects its owner, a device row or the joint's node, with the tree
  unfolded to it and the I/O view kept. The inspector of a device or joint
  that owns tags gains an "E/S" / "I/O" section: each tag with module,
  address and variable, or "non affecté" with "Affecter" (into the module
  selected in the I/O view; disabled with a tooltip when there is none) and
  "Ouvrir dans E/S". The context menu of a device row gets "Afficher dans
  E/S". The mapping is read once, without disabling anything, when the I/O
  view or such an inspector appears and after a document change while
  shown, never at each selection; a late answer cannot overwrite a newer.
- Viewer, the I/O view (ADR 0049 slice P5): a fourth central layout, "E/S" /
  "I/O", chosen from the toolbar and the View menu (left out of the F4 cycle).
  It lists the modules (key, port, channels, problems, Add), edits the
  selected module's settings and its channels in place (variable, address,
  comment, Reassign, delete), maps the unmapped tags by assembly one by one
  or all at once, marks each problem on its cell and lists it at the top
  (a click focuses the cell), and offers "Créer le mapping" when io.json is
  missing. An unreadable file or legacy io.csv files show their problems and
  allow no edit. Every edit shows the route's answer and re-reads the Pantin,
  so Save and Discard follow. The viewer computes nothing: zone, type,
  address and variable are the core's.
- PLC bridge, the CLI on io.json (ADR 0049 slice P3): `pantin io migrate
  <folder>` converts io.csv and io-modules.json into io.json (the `type` column
  becomes `ioType`), refuses CSV syntax problems, a missing or invalid
  io-modules.json, an unknown module and a tag mapped twice with
  `io.csv:line:column` messages, never overwrites an io.json, and deletes the
  two files only after writing it; the P2 parser moved from core to the CLI,
  frozen. `pantin io init` writes io.json (module `m1`, port 1502) through the
  core's allocation functions, `--update` maps the unmapped tags and rewrites
  the canonical file. `pantin gvl` reads io.json with the same output format
  (modules in file order, channels in canonical order). `pantin validate`
  prints `io.json: modules[0].channels[3].address: message`, and says when
  the channel numbers follow the canonical order rather than the file's.
  `pantin gvl` lists channels in canonical order, so a GVL made from an
  unsorted io.csv may come out reordered after migrate.
- PLC bridge, I/O mapping edit routes (ADR 0049 slice P2, the write path):
  `POST /api/pantins/:pantinId/io/modules`, `PATCH` and `DELETE .../io/modules/
  :moduleKey`, `POST .../io/modules/:moduleKey/channels` (`{ "tags": [..] }`)
  and `PATCH` and `DELETE .../io/channels/:tag`, each answering the whole
  `IoMappingResponse` (404, 400 and 409 as the ADR lists them, 409 too while
  io.json is unreadable or legacy files exist). The core derives the module
  key, the port (from 1502), the zone and `ioType`, the address (lowest fit,
  registers on even addresses) and the variable (`_2`, `_3` on a collision);
  these pure functions in `core/src/domain/io-allocation.ts` are shared with
  the CLI in the next slice. Edits stay in memory until save. Renames carry
  over: each read of the mapping (route, bus, save) applies the document's
  renames to the channels' `tag`, keeps `variable`, leaves a deleted tag's
  channel as `unknown_tag` and does not carry a rename onto a stale channel's
  tag; discard resets it.
- PLC bridge, one io.json (ADR 0049 slice P1, the read path): `io.json`
  beside pantin.json holds the modules and their channels (tag, variable,
  zone, address, `ioType`, comment), checked by the new public schema
  `IoDocumentSchema` (a tag in one channel at most, unknown fields refused),
  with its JSON Schema `protocol/schema/io.schema.json` (`pantin schema io`,
  tested for freshness). The open Pantin holds the mapping like the document:
  `unsavedChanges` covers both files, save writes io.json (only when its
  canonical text changed) then pantin.json, discard re-reads both. `GET
  /api/pantins/:pantinId/io` answers the open mapping, nested by module, each
  channel annotated with its tag, and problems with a JSON `path`; the
  `mappingId` is the SHA-256 of the canonical text, `io_changed` is also sent
  when it changes, and a leftover io.csv or io-modules.json makes the mapping
  invalid (`legacy_io_files`). Breaking, with the bridge decoder and the
  shared fixture updated; the write routes come next (P2). Until P3, the CLI
  keeps reading the legacy CSV through `core/src/legacy-csv`.
- Viewer, tree rows for devices (ADR 0047 slice P1): under each assembly, one
  folder per family (action chain, conveying, product flow) lists its drives,
  actuators, sensors, belts, guides, presence sensors, emitters and absorbers
  with their type or size. A click or an arrow key selects the device like any
  tree row; Enter or a double-click opens the inspector. A device selected in
  the diagram or the 3D view unfolds its row. Registry in
  `viewer/src/tree/device-families.ts`. Partly supersedes ADR 0030 point 1.
- Viewer, state marks and context menu for device rows (ADR 0047 slice P2): a
  joint sensor or presence sensor with a bit state tag ends its row with a
  filled disc (on) or a ring (off), read from the tag values already polled
  and spoken as "Activé" or "Désactivé"; no mark until the value is known.
  A right click, or the menu key, opens the actions of the inspector toolbar
  (edit, delete). The registry gets an optional `state` per kind.
- PLC bridge, I/O mapping (ADR 0045 slice P2): `io-modules.json` (module key,
  port, unit id 1 to 247, word order, watchdog 100 ms to 1 h) and a strict
  hand-written parser and validation for `io.csv` (syntax, unknown or twice
  mapped tags, zone and type against the tag, overlaps, address range,
  CODESYS variable names; unmapped tags are a warning). `GET
  /api/pantins/:pantinId/io` reads both files on each call and answers the
  status (`valid`, `invalid`, `missing`), the `mappingId`, the rows and the
  problems with line and column. The tag bus now serves real mappings: a `plc`
  hello is accepted with the current id and refused (4003) otherwise, and the
  watchdog resets the bit commands of the mapped module. A UTF-8 byte order
  mark in `io.csv` is refused with its own problem.
- Command line: `pantin io init <folder> [--update]` writes `io.csv` and
  `io-modules.json` (module `m1`, port 1502), or appends rows for unmapped tags
  without touching existing lines; `pantin gvl <folder>` prints the CODESYS
  global variable list of a valid mapping; `pantin validate` reports io
  problems when the files exist.
- PLC bridge, Python package (ADR 0045 slice P3, ADR 0046): `packages/bridge`
  becomes `pantin-bridge` (websockets 17.1 only at run time, run with `python
  -m pantin_bridge --core <url> --pantin <id> [--listen <ip>] [--allow <ip or
  cidr>]...`), checked by `pnpm check` with the step converter's ruff, strict
  mypy and pytest; the TypeScript stub and the `@pantin/bridge` name are
  gone. One hand-written Modbus TCP slave per module (ADR 0048: asyncio, no
  Modbus library; function codes 1 to 6, 15, 16 and 23; exceptions 1, 2, 3 and
  11), on 127.0.0.1 by default; a private address needs `--allow`, and a
  public, wildcard, link-local or hostname address is refused. Sources are
  filtered at accept before any read, at most 4 connections per module, and a
  connection silent for three watchdogs (5 s at least) is closed. REAL and DINT
  registers follow the module word order, the watchdog tells the core when a
  module is lost, and a snapshot gives the core the PLC's last values back. New shared fixtures
  `io-mapping-responses.json`. pymodbus 3.15.0 is a test client only; the slave
  is checked by table-driven tests, raw-socket tests, a `hypothesis` fuzz test
  and a test that no module imports a Modbus library.
- Phase 6, in progress (ADR 0043): schema version 12 with belts, guides,
  emitters, absorbers and presence sensors; the Rapier physics engine in the
  core; products carried by belts driven through the drive, motor and drum
  chain; photoelectric presence sensors; the automated phase 6 exit test.
- Phase 6 HTTP API (ADR 0043 point 12): create, replace and delete routes for
  `belts`, `guides`, `emitters`, `absorbers` and `presence-sensors`, with
  conflicts that name the bodies and drum joints in use; `POST .../reset`,
  which clears products, commands and faults but keeps unsaved edits, the
  clock and the step count; and `products` in the pose response and the pose
  stream, so that a product moving on a stopped machine is sent.
- `objects` in the pose response and the pose stream: the world pose of every
  belt, guide, emitter, absorber and presence sensor, resolved by the core with
  the frame rule of its physics step, so the viewer draws them where the
  colliders and rays are.
- Viewer, phase 6 drawing (ADR 0043 point 13): products as boxes coloured by
  material, belts with a travel arrow, outlined guides, emitters and absorbers,
  and presence sensor beams lit by their `state` tag.
- Viewer, phase 6 editing (ADR 0043 point 13): create, edit and delete belts,
  guides, emitters, absorbers and photoelectric presence sensors from the
  inspector (placement in mm and degrees, sizes in mm, mass in kg, delays in
  ms, body picker limited to the assembly); a click in the 3D view selects
  them, nearest hit first; an emitter's "Créer un produit" button pulses its
  `spawn` tag; "Remise à zéro" in the transport bar and the Edit menu calls the
  reset route. French and English labels.
- Joint axis from a picked face (ADR 0041) and the assembly frame trihedron
  with a local or global gizmo (ADR 0042).
- One inspector for properties and positioning (ADR 0039) and nested
  assemblies following the STEP tree (ADR 0040).
- A phase 6 object without `body` is placed in the frame of its assembly as
  posed, the static frame moved by the joints that anchor the assembly (the
  ADR 0042 trihedron frame), in the physics step and in the pose response: a
  belt or guide on a conveyor module carried by a lift rides with it (ADR 0043
  point 1).
- Phase 7, slice P1 (ADR 0045, ADR 0046): the tag bus, a WebSocket at
  `GET /api/pantins/:pantinId/bus` served by the core with `ws` 8.22.0
  (`@types/ws` 8.18.2 for development). Messages `hello`, `subscribe`,
  `write`, `release`, `plc_status` and `welcome`, `snapshot`, `tags`, `ack`,
  `error`, `console`, `clock`, `io_changed` are Zod schemas in
  `@pantin/protocol` (`tag-bus.ts`, version 1) with shared fixtures in
  `packages/protocol/fixtures` for the Python bridge. The upgrade checks the
  Host (421), the Origin (403; absent is accepted) and refuses the
  `X-Pantin-Exposure` header (403); at most 16 bus connections, one `plc` per
  Pantin, the `plc` role from loopback or the core's listen address only
  (close codes 4000 to 4005), a ping every second and an end to a connection
  with no pong for 3 s. The `plc` role needs an I/O mapping, which slice P2
  provides: until then the core refuses it with 4003.
- Write sources and forced tags (ADR 0031 point 6, ADR 0045 point 5): a client
  write, over REST or the bus, forces its tag; a PLC write to a forced tag is
  ignored, acknowledged as ignored and logged as `forced_tag_written`; releasing
  a tag (`DELETE .../tags/:tag/force`, `DELETE .../forces`, bus `release`)
  applies the PLC's last value; reset and discard clear the forces. `forced`
  is part of every tag.
- Watchdog on the core's side (ADR 0045 point 11): a lost PLC module, or a lost
  bridge, resets the bit commands mapped on it to 0, with the console codes
  `plc_connected`, `plc_disconnected`, `bridge_connected` and
  `bridge_disconnected`; pausing with a bridge connected writes
  `clock_paused_with_bridge`. French and English wording in the viewer.
- `deploy/dev-exposure`: the nginx site answers 403 for the tag bus and marks
  every proxied request with `X-Pantin-Exposure: cloudflare` (ADR 0046 point 7).
  The site must be installed again by hand.

### Changed

- The inspector's I/O part is a collapsible "I/O" section of the property
  grid, like the others: one row per tag with its label, the module
  connection dot, its module, zone and address, and a button to open it in
  the I/O view. The drive's empty "Diagnostic" row reads "None".
- The PLC bridge block moved to the bottom of the left side panel (ADR 0050
  amendment), as a connection card visible in every layout: a coloured state,
  Start or Stop and a "Config E/S" gear button in its header, the network
  as a chip that unfolds its fields, and every module of io.json with its
  PLC connection, the bridge stopped included. The I/O view's module list
  shows the same dots. The bar at the top of the I/O view and the I/O choice
  of the top toolbar are removed.
- Documentation, the PLC bridge started from the viewer (ADR 0050 slice P4):
  the bridge README, the plc-cylinder example README and CLAUDE.md section 4
  describe starting the bridge from the I/O view; the command line stays for
  tests and debugging.
- A bit tag accepts only 0 or 1 and an integer tag only whole numbers, over REST
  and the bus (ADR 0045 point 5, ends the ADR 0012 point 2 tolerance).
- Every REST tag write now forces its tag, the emitter button of the viewer
  included, until it is released.

### Fixed

- Viewer: STL bodies (binary and ASCII) now display. The mesh bytes were given
  to Babylon 9.28 as a raw buffer, which its STL plugin rejects ("Plugin does
  not support loading ArrayBufferView"); they are now given as a `File`. A body
  whose mesh fails to load reports the error once instead of being retried at
  every redraw.
- The CI workflow now runs on pushes to `develop` and `master`; it watched a
  `main` branch that does not exist.
