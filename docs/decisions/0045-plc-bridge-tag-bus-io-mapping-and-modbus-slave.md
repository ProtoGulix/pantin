# 0045. PLC bridge: tag bus, I/O mapping and Modbus slave

- Status: accepted
- Date: 2026-10-13
- Partly superseded by: ADR 0048 (points 3, 10 and 13 P3: a hand-written Modbus slave instead of pymodbus)
- Partly superseded by: ADR 0049 (points 4, 6, 7, 9 and 10: one io.json edited from the viewer, renames carried, io_changed and mappingId on the open mapping)
- Extended by: ADR 0050 (the core starts and stops the bridge; `--status-lines`)
- Applies: ADR 0003 (slave first), ADR 0007 (Python bridge, pymodbus),
  ADR 0031 point 6 (forced tags), ADR 0032 (Context and point 13: a PLC in
  the loop only makes sense at 1x; point 11: the falling-behind warning)
- Amends: ADR 0003 point 2 (the per-module endpoint model reaches the
  protocol in `io-modules.json` before spike 4 measured it, as
  configuration) and point 3 (one listen address on the bridge command
  line for all modules; one address per module goes to the backlog)
- Defers: ADR 0031 point 4 (diagnostics on the tag bus: console entries
  are sent, diagnostics are not yet)
- Extends: ADR 0012 (tag writes), ADR 0019 (tag names, renames), ADR 0015
  and ADR 0032 (events the tag bus also carries), ADR 0031 (console codes)
- Changes: CLAUDE.md sections 4 (bridge is a Python package), 5 (I/O list),
  9 (tag bus), 13.7 (phase 7 exit, OPC UA out of the phase)
- Security: ADR 0046

## Context

Phase 7 of the roadmap (CLAUDE.md section 13.7): a PLC drives a scene in
closed loop through Modbus TCP, with CODESYS variables generated from the
CSV. The user approved the following on 2026-10-13:

- Exit criterion, stage 1: an automated closed-loop integration test in
  `pnpm check`. It runs the core, the Python bridge and a pymodbus client
  playing the PLC on an example scene: a 5/2 valve, a double-acting
  cylinder and two limit switches, optionally the phase 6 belt and cell.
  It runs N cycles. It checks that the edge order and the cycle time match
  the stroke and speed at 1x. It checks that a source outside the allow
  list is refused at accept. It checks that a PLC write on a forced tag is
  ignored and logged as `forced_tag_written`.
- Stage 2 is a real CODESYS Control Win V3 program. It is PENDING: the
  user has no CODESYS VM (2026-10-13). Spike 4b therefore cannot run: port
  other than 502, poll rate, reconnection, source IP through NAT or bridge,
  REAL word order. CLAUDE.md section 13 accepts "test automatique ou
  démonstration reproductible", so the phase closes on stage 1 and the
  real demonstration is recorded as pending. Every unmeasured behaviour
  becomes configuration: port, REAL word order and unit id, per module.
- A WebSocket tag bus in the core (CLAUDE.md section 9), with its schema in
  the protocol. The viewer stays on REST and SSE in phase 7.
- Dependencies: `ws` in core; `pymodbus` and `websockets` in the bridge.
  OPC UA leaves phase 7 (backlog, its own ADR later).
- An `io.csv` per Pantin folder, read by one strict hand-written parser in
  TypeScript, which the core serves to the bridge. The file maps tags and
  does not define them. `pantin io init` pre-fills it; `pantin gvl`
  generates the CODESYS GVL from it.
- Values at the PLC are in SI units, as in the core. A watchdog applies on
  PLC disconnection. Pause and step stay allowed with a bridge, with a
  console warning. Forced tags follow ADR 0031 point 6.
- User answers on 2026-10-13 to the architect's questions: `@types/ws` as a
  development dependency; module settings in a separate `io-modules.json`;
  every client write forces its tag (ADR 0031 point 6), with a release in
  the viewer; the watchdog resets bit commands only; the defaults of
  points 6 and 9 and ADR 0046 (port 1502, `low_word_first`, unit id 1, 1000 ms,
  `--allow` required in `lan`, `plc` role from loopback only, widened
  during review to the core's listen address in `lan` mode, confirmed);
  the TypeScript bridge stub removed; the nginx change installed by hand;
  the amendment of ADR 0003 points 2 and 3, confirmed the same day.

Facts checked in the repository on 2026-10-13:

- `packages/bridge` is an empty TypeScript stub (`src/index.ts`:
  `export {};`, `package.json`, `tsconfig.json`), referenced by the root
  `tsconfig.json`. `tests/workspace-conventions.test.ts` recognises a
  Python package by its `pyproject.toml` and today expects only
  `step-converter`.
- `step-converter` runs its own checks (`check.sh`: ruff format, ruff,
  mypy strict, pytest, via `.venv`). The root `pnpm check` calls it as
  `check:python`, and CI installs Python 3.13 and runs `pnpm setup:python`.
- Tags are derived from the document (`core/src/domain/tag-entries.ts`):
  joints, drives, joint sensors, emitters, presence sensors. Names are
  `<assembly>.<tagKey>.<member>` (`protocol/src/tag.ts`, `TagNameSchema`).
  Types in use: `bit` (valve coils, contactor `run`, sensor `state`),
  `float` (servo `setpoint`/`position`, VFD `speed_setpoint`/`speed` with
  `quantity: "percent"`, joint `setpoint`/`position`) and `integer` (encoder
  `count`, feedback). `TagValueSchema` accepts any finite number; 0/1 for a
  bit is "not enforced yet".
- Tag routes are REST only (`core/src/http/tag-routes.ts`): list, write,
  console read. A feedback write is refused (ADR 0012 point 3). No write
  source is recorded.
- `protocol/src/console.ts` already has `forced_tag_written` (error, params
  `tag`, `forcedValue`, `writtenValue`), with the folding of ADR 0031
  point 3.
- The core enforces the ADR 0004 rules at start-up from `--listen` and
  `--allow` (`core/src/main.ts`, `domain/network-config.ts`). It filters
  sources on accept with a `prependListener("connection")` that destroys
  the socket synchronously (`http/server.ts`). Its Host check runs in the
  request path (`http/request-handler.ts`). The server handles no
  `upgrade` today.
- `cli` already imports `@pantin/core` (`validate-folder.ts`), which the
  boundary rules allow (`.dependency-cruiser.cjs`: only core, viewer and
  bridge are isolated from each other).
- pymodbus 3.15.0 (checked in the wheel): `ModbusServerContext` and the
  sparse data blocks log "deprecated and will be removed in v4"; `SimDevice`
  is marked experimental; `ServerRequestHandler` (server/requesthandler.py)
  is the internal class the spike 0003 accept filter subclasses; the
  client takes `source_address` (client/tcp.py:69); its register helpers
  default to `word_order="big"` (client/mixin.py:911); the `single`
  argument of the server context is deprecated (datastore/context.py:94).
- Spike 0003: pymodbus answers a 10 to 20 ms poll with request p99 below
  1.6 ms; the tag bus hop adds about 1.2 ms p50 / 1.6 ms p99.

## Decision

1. **Exit criterion.**
   - Stage 1, automated, in `pnpm check`: the P4 test below.
   - Stage 2 is P6, pending. The phase is closed on stage 1, and the
     CHANGELOG and CLAUDE.md section 13.7 say that a real CODESYS program
     has not yet driven Pantin.
2. **Packages.**
   - `packages/bridge` becomes a Python package, `pantin-bridge`. It is not
     published (the name is NOT VERIFIED, spike 0004) and laid out like
     `step-converter`: `pyproject.toml`, `requirements.txt`,
     `requirements-dev.txt`, `setup.sh`, `check.sh`, `src/pantin_bridge/`,
     `tests/`.
   - The TypeScript stub, its root `tsconfig.json` reference and the
     `@pantin/bridge` npm name are removed.
   - `check:python` and `setup:python` run both Python packages.
   - The bridge cannot import Zod. It decodes every message and the
     mapping with typed hand-written functions at its boundary
     (CLAUDE.md 8.6). It is held to the protocol by shared fixtures in
     `packages/protocol/fixtures/`: bus messages and address cases. A
     vitest test checks the fixtures against the Zod schemas, and pytest
     decodes the same files.
3. **Dependencies, exact pins** (looked up on 2026-10-13, each at least
   two weeks old):

   | Package | Where | Pin | Released | Licence |
   | --- | --- | --- | --- | --- |
   | `ws` | core | 8.22.0 | 2026-09-26 | MIT |
   | `@types/ws` | core, dev | 8.18.2 | 2026-09-29 | MIT |
   | `pymodbus` | bridge | 3.15.0 | 2026-08-13 | BSD-3-Clause |
   | `websockets` | bridge | 17.1 | 2026-08-26 | BSD-3-Clause |

   - pymodbus 3.16.1 (2026-10-11) and websockets 17.2 (2026-10-03) are
     too recent. The pins are the versions spike 0003 measured.
   - `ws` has no dependencies; its optional peers (`bufferutil`,
     `utf-8-validate`) are not installed.
   - Both Python wheels ship `py.typed`.
   - The bridge's development tools are the step-converter's pins: ruff,
     mypy, pytest. Async tests use `asyncio.run` inside plain tests, so no
     `pytest-asyncio` is needed.
4. **Tag bus**: `GET /api/pantins/:pantinId/bus` upgraded to a WebSocket.
   - The Pantin is opened as by any other route. The bus is served by the
     core's HTTP server and port, so the source filter and the Host check
     apply. The Origin check is in ADR 0046.
   - Frames are JSON text; a binary frame is a protocol error. A message
     is at most 64 KiB (`maxPayload`).
   - At most 16 bus connections per core, counted apart from the 16 SSE
     streams of ADR 0015, and one `plc` connection per Pantin.
   - Schema in `protocol/src/tag-bus.ts`: unions discriminated on `type`,
     `TAG_BUS_VERSION = 1`. The shared fixtures (point 2) are the
     contract the Python bridge is held to; the schemas carry cross-field
     rules that a JSON Schema export would drop, so an export waits for a
     consumer (backlog `viewer-on-tag-bus.md`; amended in P1 review).

   Client to core:

   | `type` | Fields | Notes |
   | --- | --- | --- |
   | `hello` | `version`, `role` (`client` or `plc`), `mappingId` (plc only) | first message, within 5 s |
   | `subscribe` | `tags`: names, or `"*"` | answered by `snapshot` |
   | `write` | `id`, `tag`, `value` | source = the connection's role |
   | `release` | `id`, then `tag` or `all: true` | `client` role only |
   | `plc_status` | `module`, `connected`, `reason` (`closed`, `timeout`, null) | `plc` role only |

   Core to client:

   | `type` | Fields | When |
   | --- | --- | --- |
   | `welcome` | `version`, `consoleId`, `clock` | after a valid `hello` |
   | `snapshot` | `step`, `tags` [{`name`, `value`, `forced`}] | on `subscribe`, and after a runtime reset or discard |
   | `tags` | `step`, changed `tags` (same items) | after a scheduler tick in which a subscribed value or force changed |
   | `ack` | `id`, `tag` (same item), `ignored` (null or `forced`) | after each `write` and `release` |
   | `error` | `id` (or null), `code`, `message` | `code` uses the API error codes |
   | `console` | `entry` (`ConsoleEntrySchema`) | each new or folded entry; ADR 0028 diagnostics come later (ADR 0031 point 4 deferred) |
   | `clock` | `SimulationClockState` | as the `clock` SSE event (ADR 0032 point 9) |
   | `io_changed` | none | the Pantin's tag list changed (point 7) |

   - A write source is the role declared in `hello`, never a field of the
     write, so one connection cannot mix sources.
   - Forcing is the client write itself (ADR 0031 point 6); there is no
     separate force message.
   - Close codes (RFC 6455 section 7.4.2 leaves 4000 to 4999 to
     applications):
     - 4000: invalid message;
     - 4001: unsupported version;
     - 4002: a `plc` connection already exists;
     - 4003: the mapping does not match or has changed;
     - 4004: no `hello` in time.
     - 4005: role not accepted from this source (ADR 0046 point 6).
   - The core pings every 1 s and ends a connection with no pong for 3 s.
   - The viewer keeps REST and SSE in phase 7. Moving it to the bus is a
     backlog item (`viewer-on-tag-bus.md`).
5. **Write sources and forced tags** (ADR 0031 point 6). For each command
   tag, the core keeps runtime state: the last write source (`client`,
   `plc` or none), `forced`, and the last value the PLC wrote.
   - A client write, REST `PUT .../tags/:tag` or bus `write` from a
     `client` role, applies as today (queued, ADR 0012 point 3) and makes
     the tag forced.
   - A PLC write to a forced tag is ignored. It is acknowledged with
     `ignored: "forced"` and logged as `forced_tag_written`. Its value is
     kept as the PLC's last value.
   - A PLC write to a tag that is not forced is queued as a client write
     is, without forcing it.
   - Releasing a tag (bus `release`, or REST
     `DELETE .../tags/:tag/force`; `DELETE .../forces` releases all) ends
     the force. It then applies the PLC's last value as a PLC write, when
     there is one. The bridge only sends changes, so without this a
     released tag would keep the forced value until the PLC changed it.
   - Reset and discard clear the forces and the PLC's last values, like
     setpoints (ADR 0012 point 7). Each then sends a `snapshot`.
   - Only command tags can be written or forced in phase 7. Forcing a
     feedback tag (a broken sensor) goes to the backlog.
   - `TagSchema` gains `forced: boolean`.
   - A bit tag accepts only 0 or 1 and an integer tag only integers, on
     REST and on the bus. This ends the ADR 0012 point 2 tolerance.
6. **`io.csv`**, in the Pantin folder: semicolon-separated, UTF-8 without
   a byte order mark (a BOM is refused with its own problem, since nothing
   is trimmed and Excel's "CSV UTF-8" adds one; bytes that are not UTF-8
   are refused too), LF or CRLF, at most 1 MiB. The first line must be exactly
   `tag;variable;module;zone;address;type;comment`, and that header is the
   version of the format.

   | Column | Content |
   | --- | --- |
   | `tag` | a tag name of the Pantin (`TagNameSchema`) |
   | `variable` | the CODESYS variable (point 9) |
   | `module` | a module key from `io-modules.json`, key pattern of ADR 0019 |
   | `zone` | `coil`, `discrete_input`, `holding_register`, `input_register` |
   | `address` | protocol address, 0-based decimal (not the 1-based "40001" notation) |
   | `type` | `BOOL`, `REAL`, `DINT` |
   | `comment` | free text, may be empty |

   - No quoting and no escapes: a field never contains `;`, `"` or a line
     break. Fields are not trimmed. Blank lines are refused, except one
     final newline. Every row has exactly 7 fields.
   - The parser lives in `core/src/domain/io-list.ts`: a pure function from
     text to rows, or problems with line and column. No CSV library.
   - Module settings live beside it in `io-modules.json` (Zod schema in the
     protocol): `schema_version: 1`, then `modules` [{`key`, `port`,
     `unitId`, `wordOrder`, `watchdogMilliseconds`}].
     - Defaults: `unitId` 1, `wordOrder` `low_word_first`,
       `watchdogMilliseconds` 1000.
     - Ports are 1024 to 65535 and unique; keys unique; unknown fields
       refused.
     - `unitId` is 1 to 247 (Modbus serial slave addresses: 0 is
       broadcast, 248 to 255 reserved; NOT VERIFIED, recalled; CODESYS may
       send another value, spike 4b).
     - `watchdogMilliseconds` is an integer from 100 to 3 600 000: below
       100 ms a normal 20 to 50 ms poll could trip it on one late request.
     - At most 1 MiB. A missing `io-modules.json` beside an `io.csv` makes
       the mapping `invalid` (problem `modules_missing`).
   - Listen address and allow list are machine settings and stay on the
     bridge command line (ADR 0046), as for the core.
   - The CSV maps tags, it never defines them. Tags come from the document
     (CLAUDE.md section 5: never a tag defined by hand in two places).
7. **Validation**, pure (`core/src/domain/io-validation.ts`), against the
   open document (unsaved edits included):
   - Errors:
     - syntax;
     - unknown tag;
     - tag mapped twice;
     - unknown module;
     - zone not matching direction: a command goes to `coil` or
       `holding_register`, a feedback to `discrete_input` or
       `input_register`;
     - type not matching: `bit` → `BOOL` in a bit zone, `float` → `REAL`,
       `integer` → `DINT`, both in a register zone;
     - overlaps in a module and zone (`REAL` and `DINT` take
       `address`..`address + 1`);
     - address out of 0..65535;
     - invalid or duplicate variable (case-insensitive).
   - Warnings: unmapped tags. A tag not wired to the PLC is legitimate.
   - A key rename or body move (ADR 0019 point 8) does not rewrite
     `io.csv`, which belongs to the user: the old rows become "unknown
     tag" and the new names "unmapped". Carrying renames into the file is
     a backlog item.
   - `GET /api/pantins/:pantinId/io` reads both files from disk on each
     call. It answers `IoMappingResponse`:
     - `status`: `valid`, `invalid` or `missing`;
     - `mappingId`: SHA-256 over each file's byte length followed by its
       bytes (a missing file hashed as absent), so a byte moved from one
       file to the other changes it; null when `missing`;
     - `modules`;
     - `rows`, with each tag's type and direction;
     - `problems`: {`file`, `line`, `column`, `code`, `message`}, with
       `line` and `column` 1-based, and null for `io-modules.json`
       problems (amended in P2 review);
     - `unmappedTags`.
   - `pantin validate` reports the same problems when the files exist.
   - The core sends `io_changed` when the tag list changes (an element
     created, deleted or re-keyed).
8. **Type mapping.**

   | Tag | PLC type | Zone | Registers |
   | --- | --- | --- | --- |
   | bit, command | BOOL | coil | 1 coil |
   | bit, feedback | BOOL | discrete input | 1 input |
   | float, command / feedback | REAL (IEEE 754 single) | holding / input register | 2 |
   | integer, command / feedback | DINT | holding / input register | 2 |

   - Integers are always DINT. An encoder count passes 32767 within
     seconds, and one rule for 32-bit values keeps one word order. A count
     beyond the DINT range wraps (two's complement), as a hardware counter
     does.
   - REAL rounds the core's double to single precision on feedback.
   - Values are not scaled. Units are the core's, SI (m, rad, m/s), or
     percent where the tag's `quantity` says so. Scaled INT for analog
     modules goes to the backlog.
   - Word order is per module:
     - The Modbus Application Protocol Specification V1.1b3 (section 4.2)
       defines big-endian bytes inside a 16-bit register and nothing for
       32-bit values.
     - pymodbus defaults to `big` (high word first, client/mixin.py:911).
     - The default here is `low_word_first`. CODESYS Control Win V3 runs
       on x86 and WAGO PFC controllers on ARM, both little-endian. A REAL
       overlaid on two consecutive `%IW`/`%QW` words would then read the
       low word from the lower address. NOT VERIFIED: no CODESYS document
       was read and nothing was measured (spike 4b).
     - `high_word_first` is one setting away.
9. **`pantin io init <folder>`** writes `io.csv` and `io-modules.json`.
   - It refuses when they exist, unless `--update`. With `--update` it
     appends rows for the unmapped tags and leaves existing lines byte for
     byte.
   - Everything goes in module `m1`, port 1502, in tag list order, each tag
     at the next free address of its zone.
   - Variables are derived from the tag name: `.` and `-` become `_`, runs
     of `_` are collapsed, and leading or trailing `_` are removed. Then a
     name that starts with a digit gets the prefix `t_`. Last, a name over
     64 characters is cut at 56, its trailing `_` removed, and `_` plus the
     first 7 hexadecimal characters of the tag name's SHA-256 appended, so
     `pantin io init` writes a file that validates. Collisions are left
     for validation to report.

   **`pantin gvl <folder>`** prints a GVL declaration to stdout, and
   refuses an invalid mapping:
   - a header comment saying it is generated;
   - `VAR_GLOBAL`, then one `name : TYPE; // module zone address, tag` per
     row, then `END_VAR`;
   - no `AT` addresses: CODESYS assigns `%I`/`%Q` addresses in the device
     tree, and the channels are mapped to these variables there.

   CODESYS identifier rules, NOT VERIFIED (IEC 61131-3 as commonly
   summarised; not read for this ADR):
   - variables must match `^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$`: no
     leading, trailing or double underscore;
   - at most 64 characters, a conservative limit;
   - unique regardless of case;
   - not an IEC 61131-3 keyword or elementary type name (a list in core,
     itself NOT VERIFIED as complete).

   Also NOT VERIFIED:
   - whether a REAL or DINT variable can be mapped directly onto two
     register channels in the CODESYS I/O mapping, or needs WORD variables
     and a conversion (P6);
   - how to import the text (pasting into a GVL editor is assumed).
10. **The bridge** (`python -m pantin_bridge --core <url> --pantin <id>
    --listen <address> [--allow <ip or cidr>]...`):
    - Start-up:
      - reads `GET .../io` (stdlib `urllib`) and stops with an actionable
        message unless the status is `valid`;
      - opens the bus as `plc` with the `mappingId` (the core reads the
        files again and refuses a different id, code 4003);
      - subscribes to the mapped tags;
      - then opens one pymodbus TCP slave per module on `--listen`:`port`
        with the ADR 0046 accept filter.
    - Modules:
      - Only `modbus_slave.py` imports pymodbus. pymodbus's datastore API
        is moving to v4 (ADR 0007).
      - Per module, a data block subclass forwards PLC writes to coils and
        holding registers.
      - Register encoding is a pure module with its word order
        (`registers.py`).
      - Requests for another unit id are not served. The exact pymodbus
        behaviour is checked in a P3 test.
    - Writes to the core: only changes compared with the last value the
      PLC wrote. On every `snapshot`, the bridge writes each mapped command
      whose datastore value differs, so that a reset, or a bridge started
      after the PLC, lines up.
    - Feedback from `tags` events goes into discrete inputs and input
      registers.
    - On `io_changed`, or when the bus closes, the bridge stops its slaves
      and exits non-zero with a message asking for a restart. No reconnect
      loop in phase 7.
11. **Watchdog.**
    - PLC side, in the bridge, per module, a pure state machine with an
      injected clock:
      - a module becomes connected at its first served request;
      - it becomes disconnected when its last accepted TCP connection
        closes (`closed`), or after `watchdogMilliseconds` without any
        request (`timeout`);
      - each change is sent as `plc_status`.
    - Core side:
      - On `connected: false`, the core writes 0 as a PLC write to every
        bit command tag mapped on that module. Float and integer commands
        keep their value: a servo setpoint of 0 would drive the axis to 0,
        which a real drive does not do on fieldbus loss (user's choice,
        2026-10-13). Forced tags keep their forced value, and their PLC
        last value becomes 0.
      - The core logs `plc_disconnected` (warning, params `module`,
        `reason`), and `plc_connected` (info) on reconnection.
      - When the `plc` bus connection closes or misses its pongs, the core
        does the same for every mapped module and logs
        `bridge_disconnected` (warning), with `bridge_connected` (info) at
        `hello`.
      - The core holds the mapping read at `hello` for this.
    - New console codes, source `pantin`: `plc_connected`,
      `plc_disconnected`, `bridge_connected`, `bridge_disconnected`,
      `clock_paused_with_bridge`.
12. **Clock** (ADR 0032 Context, points 11 and 13). Pause and step stay allowed with a
    bridge connected.
    - Pausing while a `plc` connection exists writes
      `clock_paused_with_bridge` (warning) instead of `clock_paused`.
    - A bridge connecting to a paused Pantin writes it too.
    - Step requests write nothing, as before.
    - No speed factor (ADR 0032 point 13).
13. **Slices.**
    - P0: this ADR and ADR 0046.
    - P1, protocol and core:
      - `tag-bus.ts` and fixtures;
      - `ws` with an upgrade handler (Host, Origin, source; ADR 0046);
      - write sources, forced tags, the release routes and `forced` in
        `TagSchema`;
      - bit and integer value checks;
      - the new console codes (bridge connect, disconnect and clock
        warning), the PLC-disconnect zeroing and the paused-clock warning;
      - the nginx change of ADR 0046.
      - Tests drive the bus with a `ws` client in vitest.
    - P2: the `io-modules.json` schema, the `io.csv` parser and validation,
      the `io` route, `io_changed`, `pantin io init`, `pantin gvl`,
      `pantin validate` additions.
    - P3: the Python bridge package, its tooling in `pnpm check`, the slaves
      with the accept filter, the bus client, the watchdog, register
      encoding, and a pytest that fails loudly if pymodbus internals
      change (ADR 0007 point 3).
    - P4: `examples/plc-cylinder/` and the exit test
      (`packages/bridge/tests/test_closed_loop.py`, run by its `check.sh`):
      - Scene: valve 5/2 → double-acting cylinder → two limit switches,
        and optionally a contactor, belt and cell.
      - Setup: the test starts the core with `node` on a temporary copy of
        the example at a free port, then the bridge with
        `--listen 127.0.0.1 --allow 127.0.0.1`.
      - Cycles: a pymodbus client polls every 20 ms and runs 5 cycles.
      - Edge order: retracted falls before extended rises, and both are
        never 1.
      - Timing: each stroke, measured from the coil write to the switch
        edge read, lies within [T, T + 2 polls + 50 ms]. T is computed
        from the scene's stroke and speed. The tolerance is a parameter,
        NOT VERIFIED on a loaded VM.
      - Allow list: a client bound to source 127.0.0.5 is refused before
        any reply.
      - Forced tag: a REST write forces a coil; the client's opposite
        write leaves the tag unchanged and `GET .../console` holds
        `forced_tag_written`; after a release, the client's value applies.
      - Watchdog: closing the client resets the coils to 0, with
        `plc_disconnected`.
    - P5: viewer. Forced-tag marks and release (one tag in the inspector,
      all from the index; ADR 0031 point 6) through REST, the `forced`
      field, the console codes, the `io` status and bridge status.
    - P6: real CODESYS Control Win V3 demonstration with spike 4b. PENDING,
      no VM.

## Rejected alternatives

- **REST and SSE only for the bridge**:
  - Each PLC write would be an HTTP request.
  - Feedback would need a second stream, and the core could not tell the
    bridge's liveness from request gaps.
  - CLAUDE.md section 9 already specifies a WebSocket bus.
- **A CSV that defines tags**: tags would be defined twice, in the document
  and in the CSV, against CLAUDE.md section 5. A rename would also have to
  be carried both ways.
- **Modbus master first**: the PLC program would have to expose its I/O as
  registers (ADR 0003).
- **OPC UA now**: a second stack and a security model (certificates) with
  no measured need. It stays in the backlog and gets its own ADR.
- **A CSV library**: about twenty lines of strict parsing; a library brings
  quoting rules the format refuses and one more dependency.
- **A Python CSV parser in the bridge**: two parsers of one format.
- **A write source carried by each message**: one socket could claim both
  roles.
- **INT for integers**: overflows an encoder count within seconds.
- **Module settings as extra CSV rows or in `pantin.json`**: either mixes
  two tables in one file, or changes the public document schema (a version
  bump) for PLC-side settings.
- **Re-reading the mapping live in the bridge**: hot swapping datastores
  while a PLC polls. Exiting and restarting is boring, and the watchdog
  covers it.

## Consequences

- CLAUDE.md:
  - section 4: bridge in Python, contract through fixtures;
  - section 5: `io.csv` maps tags, plus `io-modules.json`;
  - section 9: points to `tag-bus.ts`;
  - section 13.7: OPC UA out of the phase, exit in two stages.
- ADR 0003 and 0007 get "Extended by: ADR 0045".
- ADR 0012 point 3: forcing arrives in phase 7, not phase 8.
- `tests/workspace-conventions.test.ts` expects `bridge` and
  `step-converter` as Python packages.
- The core keeps a second address-classification implementation, in
  Python, held equal by the shared address fixtures.
- Every REST tag write now forces its tag, including the emitter button
  (ADR 0043 point 13) and test writes, and a PLC cannot override it until
  release. This is ADR 0031 point 6 as written.
- The watchdog resets bit commands only; float and integer commands keep
  their last value. A fail-safe value per tag goes to the backlog.
- Backlog entries: `viewer-on-tag-bus.md`, OPC UA, forcing feedback tags,
  carrying renames into `io.csv`, scaled INT, fail-safe values, one IP per
  module (aliases), bridge reconnection, unit id "any".
- NOT VERIFIED, for P6 and spike 4b:
  - CODESYS accepting port 1502;
  - its poll rate and request pattern;
  - its reconnection after a refused accept or a closed slave;
  - word order;
  - the unit id it sends;
  - REAL channel mapping;
  - identifier rules;
  - source IPs through NAT or bridge.
