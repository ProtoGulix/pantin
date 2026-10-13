# Changelog

All notable changes to Pantin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[SemVer](https://semver.org/). Branches and releases: ADR 0044.

## Unreleased

### Added

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
