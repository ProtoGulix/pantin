# Spike 0009. Modbus TCP slave for the bridge without experimental API or library internals

- Date: 2026-10-13
- Covers: ADR 0045 point 10 and ADR 0046 points 2, 4 (P3 on `feat/phase-7-p3-python-bridge`,
  commit 6666048). Follows spike 0003.
- Question: the user refuses experimental API and library internals. How does the bridge
  (a) forward each PLC write to the core, (b) serve reads from a datastore the bridge updates,
  (c) refuse a source IP at accept before any read, (d) answer another unit id with an
  exception, (e) answer exception 2 outside the mapped range, (f) limit connections per module?
- Verdict: **pymodbus 3.15.0 cannot do it with stable, documented API.** Of the alternatives,
  only a hand-written asyncio slave meets all six points through public API (the standard
  library's). Prototype: 158 lines, 0 errors, p99 below pymodbus 3.15.0 in the same harness.
  Recommendation in the last section; it is an opinion, and it needs the user's agreement
  (dependency removal, CLAUDE.md section 14.8).

## What P3 depends on (read in the installed wheel, `packages/bridge/.venv`, pymodbus 3.15.0)

| Need | P3 mechanism | Status in 3.15.0 |
| --- | --- | --- |
| Write interception | `SimDevice(action=...)` | `simulator/__init__.py:3`: "This code is experimental and not integrated into production." The 3.12.0 release notes say SimData/SimDevice "are now released and integrated": the two statements disagree |
| Read/write the datastore | `server.async_getValues/async_setValues` | `server/base.py:110`; added in 3.13.0 (#2889). Public by name, but `API_changes.rst` (3.13.0) presents it as the replacement for the removed datastore get/setValues |
| Accept filter | subclass `ServerRequestHandler` + override `ModbusTcpServer.callback_new_connection` | `server/requesthandler.py:16`, `server/base.py:72`: no documented extension point. The public hook `trace_connect` receives only a bool (`server/server.py:34`) |
| Range check | mutate `pdu.address` in `trace_pdu` | `trace_pdu` is a public constructor argument; mutating the PDU is not a documented use |

## Option 1. pymodbus 3.15.0 (or newer), another way

Latest release: 3.16.1, 2026-10-11 (two days old, below the two weeks rule). Latest old enough:
**3.15.0, 2026-08-13**. 3.16.0 (2026-10-11) is a bug fix release that removes
`allow_multiple_devices` from the serial server only (API_changes.rst, 3.16.0). Nothing in its
notes touches the datastore or the accept path. Source: GitHub releases of pymodbus-dev/pymodbus,
`API_changes.rst` on the dev branch.

Timeline of the datastore (release notes and `API_changes.rst`, fetched 2026-10-13):

| Version | Date | Change |
| --- | --- | --- |
| 3.10.0 | 2025-07-27 | `ModbusSlaveContext` replaced by `ModbusDeviceContext` |
| 3.12.0 | 2026-02-08 | SimData/SimDevice integrated in the server; "old datastore classes will disappear in v4.0.0 or a bit later" |
| 3.13.0 | 2026-04-12 | "datastore get/setValues is removed, please use server.async_get/setValues instead"; datastores show a deprecation warning and use SimData/SimDevice internally (#2897) |
| 3.15.0 | 2026-08-13 | `SimDevice.action` docs fixed (#2988, #2989) |

Deprecation warnings in the wheel: `datastore/context.py:67-68` (`ModbusDeviceContext`,
`ModbusSequentialDataBlock`, `ModbusSparseDataBlock` "deprecated and will be removed in v4"),
`context.py:121-122` (`ModbusServerContext`), `datastore/simulator.py:493-494`
(`ModbusSimulatorContext`). The upgrade page (https://pymodbus.readthedocs.io/en/latest/source/upgrade_40.html)
names no removal date beyond "v4.0.0", says nothing on custom data blocks and nothing on a
connection hook.

**A custom data block subclass no longer works in 3.15.0.** Reason in the code:
`ModbusDeviceContext.__init__` deep-copies `co.simdata` etc. into a `SimDevice`
(`context.py:51-62`) and never calls the block again; `ModbusServerContext.async_getValues`
returns `DEVICE_BUSY` for a non-simulator device (`context.py:139-153`). Measured
(`scratchpad/t_datablock.py`): a `ModbusSequentialDataBlock` subclass overriding `getValues`,
`setValues` and `async_setValues`, a client doing `write_register(3, 77)` then
`read_holding_registers(3)`: the write succeeded and read back 77, **0 calls** reached the subclass.

Other stable-looking paths:

- `trace_pdu` (public) sees each request before execution, so it can observe writes. It cannot
  veto them, cannot see the result, and does not solve the accept filter.
- No accept filter exists in public API. A firewall rule (nftables) is outside the process and
  not portable to the Windows hosts of the CODESYS target (NOT VERIFIED there).
- A front asyncio proxy doing the accept check and relaying to a loopback pymodbus: public API
  only, but two sockets per module, one more hop, and the relay becomes a Modbus-aware component
  anyway for write interception. Not measured. It carries the cost of option 4 without removing
  the dependency.

Verdict option 1: **no** on the public-API-only criterion for write interception (experimental
`SimDevice.action`) and for the accept filter (internals).

## Option 2. An older pymodbus line

- 3.12.x (last release 3.12.1, 2026-02-19) is the last line of the 3.x series before 3.13.0
  removed datastore `get/setValues`. NOT VERIFIED here that the subclass hook works there
  (nothing installed, nothing run). The accept filter is still the internal handler, so one of
  the two blockers stays.
- Older lines (2.5.3 2021-10-17, 3.0.0 2022-10-12, 3.6.9 2024-06-27, 3.8.6 2025-02-10) had the
  documented `ModbusSlaveContext` plus data block pattern, and the accept path was also internal.
- Support status: `SECURITY.md` (dev branch): "Only the latest version are supported."
- Advisories: the GitHub advisory database queried on 2026-10-13
  (`api.github.com/advisories?ecosystem=pip&affects=pymodbus`) returned none; the PyPI JSON
  `vulnerabilities` field is empty for 3.15.0; an OSV query returned an empty answer. SECURITY.md
  says vulnerabilities such as a buffer overrun "should just be reported as a normal issue", so
  CVE absence does not mean absence of bugs. NOT VERIFIED beyond these three databases.
- Going back trades a documented hook for an unsupported line and keeps the internal accept
  filter. Not recommended.

## Option 3. Other Python Modbus server libraries

Checked on PyPI JSON and the GitHub API on 2026-10-13; wheels inspected in a scratch venv.

| Library | Licence | Last release | Maintenance | Writes (public API) | Accept filter (public API) | Typing |
| --- | --- | --- | --- | --- | --- | --- |
| pyModbusTCP 0.3.1 | MIT; licence file in `dist-info/licenses` | 2026-09-30 (previous 0.3.0 2024-09-04) | pushed 2026-10-13, 5 open issues, 346 stars | yes: override `DataBank.on_coils_change` / `on_holding_registers_change` (`server.py:302,318`), called only when the value changes, per address | no: `socketserver.ThreadingTCPServer` is built inside `ModbusServer` (`server.py:1261`), and sets class attributes on the global `ThreadingTCPServer` (`:1258-1259`) | no `py.typed` |
| umodbus 1.0.4 | MPL-2.0 (file level copyleft); LICENSE in dist-info | 2020-08-27 | last push 2026-04-13, 45 open issues, Python 2.7/3.4 era classifiers | yes: routes by slave id, function code and address | partly: `get_server(server_class, ...)` takes your own `socketserver` class, whose stdlib `verify_request` could refuse a source. Behaviour NOT VERIFIED | no `py.typed` |
| modbus-tk 1.1.5 | LGPL-2.1-or-later | 2025-05-09 | not assessed | not assessed | not assessed | not assessed. LGPL: excluded by licence policy (MIT, BSD, Apache-2.0) |
| async-modbus 0.2.3 | GPL-3.0 | 2025-10-22 | n/a | n/a | n/a | excluded by licence |
| tmodbus 0.6.2 | BSD-3-Clause | 2026-08-28 | its summary says client library | no server | no | strongly typed per its summary |
| easymodbus 2.1.6, modbuslink 1.5.2, aiomodbus 0.6.0 | MIT / MIT / not stated | 2026-02-23 / 2026-07-06 / 2023-06-30 | not assessed | not assessed | not assessed | not assessed |

pyModbusTCP details that matter: the server is threaded (one thread per connection, blocking
`recv` of the 7 byte header after accept, `server.py:826-850`), it never compares the unit id
(grep: the unit id is only copied into the response, `:688`), so "another unit id answers an
exception" needs `ext_engine=` (replace the whole engine). Writes arrive on a server thread,
not on the event loop. No library of the table meets points (c) and (d) through public API
and asyncio together.

## Option 4. Hand-written asyncio slave in the bridge

pymodbus stays a dev dependency (test client). Sources: Modbus Application Protocol V1.1b3
(26 April 2012) and Modbus Messaging on TCP/IP Implementation Guide V1.0b (24 October 2006),
read from web.archive.org copies of modbus.org PDFs (modbus.org itself answered 403 to the
fetch, 2026-10-13).

Scope, with spec references (text lines of the converted PDFs):

- MBAP, 7 bytes, big endian (Messaging Guide 3.1.3): transaction id echoed, protocol id must be
  0 (otherwise "the indication is simply discarded", Guide section on PDU checking), length =
  bytes following including the unit id, unit id echoed. Max PDU 253, max TCP ADU 260
  (Application Protocol, "TCP MODBUS ADU = 253 bytes + MBAP (7 bytes) = 260 bytes").
- Unit id: on TCP the spec calls it "useless" and recommends 0xFF for a directly attached
  server (Guide); the bridge serves a configured id (ADR 0045: default 1). Another id answers
  exception 11 (0x0B, "gateway target device failed to respond", Application Protocol section 7).
- Function codes, minimum: 1, 2, 3, 4, 5, 6, 15, 16. What CODESYS uses: the CODESYS Modbus
  documentation lists FC01-FC06, FC15, FC16 and FC23 for its channels
  (https://content.helpme-codesys.com/en/CODESYS%20Modbus/_mod_edt_slave_com_channel.html: "Read
  Coils (01)", "Read Discrete Inputs (02)", "Read Holding Registers (03)", "Read Input Registers
  (04)", an entry for 05 (worded "Read Single Coil", apparently a typo for write), "Write Single
  Register (06)", "Write Multiple Coils (15)", "Write Multiple Registers (16)", "Read/Write
  Multiple Registers (23)"). That page describes the server-role channel dialog; whether the
  client-role dialog of Control Win V3 offers the same list is NOT VERIFIED (the client page
  answered 403). **FC23 is a user choice**: add it (about 25 lines) or answer exception 1.
- Quantity limits (Application Protocol): read 1 to 2000 bits (FC01, 02), 1 to 125 registers
  (FC03, 04); write FC15 1 to 1968 bits (0x07B0), FC16 1 to 123 registers; FC05 value 0x0000 or
  0xFF00; FC15/16 byte count must equal the quantity's size. Violations: exception 3.
- Exceptions: 1 (unknown function), 2 (address + quantity beyond the mapped size, the spec's own
  example uses exactly this arithmetic), 3 (structure or quantity), 11 (other unit id). A write
  that gets an exception must not reach the core (checked below).
- Framing: accumulate bytes, decode while a full frame is present (pipelining, split frames);
  on a bad protocol id or a length outside 2..254, framing is lost, so close the connection.
- Accept: `loop.create_server` protocol `connection_made` runs before asyncio registers the
  reader, so `transport.abort()` there leaves the request unread (same reasoning as spike 0003,
  measured below). `asyncio.start_server`'s callback runs after accept too, but a `Protocol` gives
  the explicit guarantee.
- Estimated size: a pure codec and handler module (about 150 lines, typed), a protocol and gate
  module (about 100), so two files under the 300 line rule; tests about 300 lines. P3's current
  `modbus_slave.py` is 297 lines, plus `tests/test_pymodbus_internals.py`, which would disappear.
- Risks: protocol bugs that pymodbus's years of field use already fixed; CODESYS behaviours not
  seen (NOT VERIFIED); owning conformance forever; mitigations in Conformance below.

## Measurements (prototype, `scratchpad/mbslave.py`, 158 lines, untyped, no FC23)

Host as in spike 0003 (KVM guest, shared, Debian, Linux 6.12.63), Python 3.13.5, pymodbus 3.15.0
client from the bridge venv, loopback, server and client in separate processes. Each cycle: FC15
write 16 coils, FC01 read 16 coils (read back checked), FC04 read 4 registers, then sleep to a
20 ms period. Baseline: pymodbus 3.15.0 `ModbusTcpServer` with `SimDevice(action=...)`, no
accept filter, same blocks (64 per zone). Latency in ms per request, client side, so it includes
the pymodbus client's own cost.

| Server | Run | Cycles | Errors | Request p50 / p95 / p99 / max | Cycle p99 |
| --- | --- | --- | --- | --- | --- |
| hand-written | 40 s | 2000 | 0 | 0.94 / 1.12 / 1.25 / 3.87 | 3.54 |
| hand-written | 20 s | 1000 | 0 | 1.03 / 1.21 / 1.33 / 11.85 | 3.74 |
| hand-written | 20 s | 1000 | 0 | 1.01 / 1.21 / 1.31 / 2.34 | 3.67 |
| pymodbus 3.15.0 | 40 s | 2000 | 0 | 1.49 / 1.84 / 2.07 / 4.05 | 5.70 |
| pymodbus 3.15.0 | 20 s | 1000 | 0 | 1.47 / 1.75 / 1.93 / 2.58 | 5.46 |
| pymodbus 3.15.0 | 20 s | 1000 | 0 | 1.47 / 1.82 / 2.13 / 3.29 | 5.87 |

Server RSS after the 40 s run: 21.5 MB (hand-written) and 23.1 MB (pymodbus); server CPU time
over the run: 1 s against 5 s (whole seconds from `ps`, coarse). The gap (about 0.5 ms p50) is
consistent across the three runs, but one shared VM, one module, no 4-module run: a decision on
latency alone is not supported, and none is needed (both are far under 20 ms).

**Accept filter** (`server_filter.py`, `client_filter.py`): server on 127.0.0.2:15320 allowing
127.0.0.3 only; clients bound to 127.0.0.1, 127.0.0.3 and 127.0.0.5 each send an FC04 request
right after connecting.

| Source | Result | Bytes seen by `data_received` |
| --- | --- | --- |
| 127.0.0.1 | ECONNRESET, refused and logged | 0 |
| 127.0.0.3 | answered (11 bytes) | 12 |
| 127.0.0.5 | ECONNRESET, refused and logged | 0 |

Repeated with the server frozen by SIGSTOP while the clients connected and sent, then resumed:
identical result, so the request bytes were already in the kernel buffer when the check ran and
still none were read. ECONNRESET (not EOF) on the client confirms unread data at the abort.

**Write interception and conformance** (`conform.py`, pymodbus client plus raw sockets):

- Writes seen by the callback, with zone, address and values: FC05 coil 5; FC06 holding 3 =
  43981; FC15 coils 10..12 = 1,0,1; FC16 holding 20..22 = 1,2,3. Reads of values set by the
  bridge side: FC03 `[0x1234, 0x5678]`, FC04, FC02 correct.
- Refused requests (exception 2 for FC03, FC01, FC16 past the end; exception 11 for unit 7)
  produced **0** callback calls.
- Raw frames: unknown FC 0x2B gives exception 1; count 0 and count 126 (FC03), count 2001
  (FC01), FC16 byte count mismatch, FC05 value 0x1234, truncated FC03 PDU give exception 3;
  a wrong protocol id, a length field of 0 and a length of 300 close the connection without
  answer; FC16 with 124 registers is a 254 byte PDU, over the limit, so it closes too.
- Pipelining: 3 requests in one segment gave 3 responses with transaction ids 21, 22, 23.
  A frame sent one byte at a time gave the right response. Two frames split at arbitrary
  offsets gave 2 responses.
- Connection limit: with a limit of 2 the third simultaneous connection was closed, the first
  two served.

## Conformance plan for the real implementation

1. Table-driven unit tests on the pure `handle_pdu` (every function code at each quantity
   boundary: 0, 1, max, max + 1; address at size - 1 and size).
2. Round trips with the pymodbus client against the real slave for FC1-6, 15, 16 (dev only).
3. Raw-socket tests for the malformed frames above, split and pipelined delivery, and the
   accept filter with FIONREAD or SIGSTOP as in this spike.
4. A fuzz test with random bytes (hypothesis, if the user accepts the dev dependency): the
   server must stay up and only answer well-formed frames.
5. Not covered by any of this: a real CODESYS master (stage 2 of ADR 0045).

## NOT VERIFIED

- Everything CODESYS Control Win V3: which function codes its client channels send, whether it
  pipelines, its behaviour on a closed connection or on exception 11 (spike 4b).
- pymodbus 3.12.x datastore subclass behaviour (option 2), pymodbus 3.16 on this task (read from
  release notes only), pymodbus v4 (not released).
- umodbus `verify_request` path and its unit id behaviour; modbus-tk and the libraries marked
  "not assessed" in option 3.
- Latency on an idle host, with 4 modules, or with a real tag bus hop; Windows hosts.
- The full text of the two Modbus PDFs was read through text conversion of archive copies; the
  figures quoted were grepped, not read page by page.
- An exhaustive advisory search: only the GitHub advisory API, PyPI JSON and OSV were queried.

## Recommendation

Opinion, not measured fact. Replace pymodbus with a **hand-written asyncio slave** in
`packages/bridge` (FC1-6, 15, 16, optionally 23), keep pymodbus 3.15.0 as a dev dependency for
tests only. It is the only option meeting the six requirements with public API (asyncio and the
standard library), it makes the accept filter, range check, unit id and connection limit plain
code, drops the "loud internals test" and `modbus_slave.py`'s coupling to a library moving to v4,
and measured 0 errors with request p99 about 1.3 ms against 2.0 ms for pymodbus in the same
harness. It also removes a runtime dependency, which fits CLAUDE.md section 8.

Main risk: ownership of a protocol implementation. A subtle framing or quantity bug would go
unseen until a real PLC meets it, and stage 2 (CODESYS) is still pending. Mitigation: the
conformance plan above, the pymodbus client as an independent reference, and a deliberately
small scope (no FC22, 23 optional, no serial, no TLS).

Open questions for the user: accept FC23 in scope or exception 1; accept removing pymodbus from
the runtime dependencies (ADR 0007 and ADR 0045 point 3 and 10 would need amending); accept
`hypothesis` as a dev dependency for the fuzz test, or fixed malformed frames only.
