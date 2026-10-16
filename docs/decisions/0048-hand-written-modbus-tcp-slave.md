# 0048. A hand-written Modbus TCP slave in the bridge

- Status: accepted
- Date: 2026-10-13
- Source: spike 0009 (docs/spikes/0009-modbus-slave-without-library-internals.md)
- Partly supersedes: ADR 0007 (points 1, 2 and 3: pymodbus at run time, its
  default bind address, the internal request handler), ADR 0045 (point 3: the pymodbus run-time pin;
  point 10: "Only `modbus_slave.py` imports pymodbus" and "a data block
  subclass forwards PLC writes"; point 13 P3: the pymodbus internals test),
  ADR 0046 (point 1: "passes the address to pymodbus"; point 2: "the spike
  0003 hook"; point 9: "a parser fault in pymodbus")

## Context

Slice P3 of ADR 0045 built the bridge on pymodbus 3.15.0 (commit 6666048,
branch `feat/phase-7-p3-python-bridge`). The data block subclass of ADR 0045
point 10 no longer works in 3.15: pymodbus converts old data blocks into a
`SimDevice`, and the overridden methods were called 0 times for a write and
a read (spike 0009, option 1; datastore `getValues`/`setValues` were removed
in 3.13.0). P3 therefore relied on `SimDevice(action=...)`, labelled
experimental (`simulator/__init__.py:3`), and on pymodbus internals:
`ServerRequestHandler` and `callback_new_connection` for the accept filter,
the server's `async_setValues` (with `async_getValues` checked by its
internals test), and a mutation of `pdu.address` in a request hook.
pymodbus has no public accept hook (`trace_connect` only receives a bool).

On 2026-10-13 the user refused to depend on an experimental API and on
library internals, and asked for another way. Spike 0009 compared:

- pymodbus used another way: no public, stable route (above);
- an older pymodbus line: only the latest version is supported
  (SECURITY.md);
- other libraries: pyModbusTCP (MIT, threaded, never checks the unit id, no
  accept hook, no `py.typed`), umodbus (MPL-2.0, no release since 2020),
  modbus-tk (LGPL) and async-modbus (GPL), excluded by licence;
- a hand-written asyncio slave: a 158-line prototype answered a 20 ms poll
  with 0 errors and a request p99 of about 1.3 ms, against about 2.0 ms for
  pymodbus in the same harness. It read 0 bytes from a refused source, even
  with the server stopped by SIGSTOP. It intercepted writes, answered
  exceptions 1, 2, 3 and 11, and handled pipelined and split frames.

The CODESYS Modbus documentation lists function codes 1 to 6, 15, 16 and 23
for its channels (spike 0009, option 4). Which ones CODESYS Control Win V3
actually sends is NOT VERIFIED (ADR 0045 stage 2).

The user chose on 2026-10-13: the hand-written slave, function code 23 in
scope, and `hypothesis` as a development dependency for a fuzz test.

## Decision

1. **No Modbus library at run time.** The bridge implements Modbus TCP
   itself, on asyncio and the standard library. Its only run-time
   dependency becomes `websockets==17.1`.
2. **Three modules replace `modbus_slave.py`:**
   - `modbus_frames.py`, pure: it cuts a byte buffer into MBAP frames and
     encodes answers. It checks protocol id 0, a length from 2 to 254
     (unit id plus a PDU of at most 253 bytes), and echoes the transaction
     id. Split and pipelined frames are handled. A malformed header closes
     the connection, since the stream can no longer be framed.
   - `modbus_pdu.py`, pure: `handle_pdu(unit_id, pdu, store)` returns the
     answer PDU and the PLC writes to forward. Function codes 1, 2, 3, 4,
     5, 6, 15, 16 and 23. For 23, the write happens before the read, as the
     Modbus specification says. Quantity limits: 2000 bits read, 1968 bits
     written, 125 registers read, 123 written, and 121 written for 23.
     Exceptions:
     - 1 for an unknown function code;
     - 2 for an address outside the mapped range, for reads and writes
       alike;
     - 3 for a bad quantity or a byte count that does not match;
     - 11 for another unit id, at any address.
   - `modbus_server.py`: one asyncio server per module, on the explicit
     listen address of ADR 0046 point 1.
     - The accept filter (ADR 0046 point 2) runs in
       `Protocol.connection_made` and calls `transport.abort()` before
       asyncio adds the reader, so no byte from a refused source is read.
     - It allows at most 4 connections per module (ADR 0046 point 4).
3. **The datastore** is plain Python per module. Its four zones are sized
   to the mapped range, and its writes go to `module_bridge.py`. That
   module keeps its P3 behaviour: changes only, snapshot sync, watchdog,
   and the coil mirror on module loss.
4. **Kept from P3:** the bus client, the message and mapping decoders, the
   register encoding, the watchdog, the address rules, the CLI and its exit
   codes, the proxy refusal, and the fixtures.
5. **Development dependencies:**

   | Package | Pin | Released | Licence | Use |
   | --- | --- | --- | --- | --- |
   | `pymodbus` | 3.15.0 | 2026-08-13 | BSD-3-Clause | independent reference client in tests |
   | `hypothesis` | 6.168.3 | 2026-09-28 | MPL-2.0 | fuzz test of the frame decoder |

   `hypothesis` 6.168.3 requires `sortedcontainers>=2.1.0,<3` (PyPI
   metadata), pinned at 2.4.0 (Apache-2.0); `exceptiongroup` is only
   needed below Python 3.11, and the bridge needs 3.13. The test client keeps pymodbus as
   the reference, so a mistake in our framing shows as a disagreement with
   a widely used implementation.
6. **Conformance tests** (spike 0009 plan):
   - table-driven tests of `handle_pdu`, covering every function code at
     quantities 0, 1, max and max + 1, and at addresses size - 1 and size;
   - round trips with the pymodbus client for all nine function codes;
   - raw-socket tests: malformed headers, split and pipelined frames, the
     accept filter (0 bytes read from a refused source), and the connection
     limit;
   - a `hypothesis` fuzz test: the server stays up and answers only
     well-formed frames;
   - a test that no run-time module imports a Modbus library.

## Rejected alternatives

- **pymodbus `SimDevice` and internals** (P3 as built): an experimental
  API, three internals and a request mutation, covered by a test that only
  says when they break. Refused by the user.
- **An older pymodbus** where a data block subclass worked: unsupported
  (only the latest version receives fixes).
- **pyModbusTCP**: it serves any unit id, has no accept hook and is not
  typed.
- **umodbus**: unmaintained since 2020.
- **modbus-tk, async-modbus**: LGPL and GPL.
- **Answering function code 23 with exception 1**: about 25 lines avoid a
  surprise if a CODESYS channel is set to it.

## Consequences

- We own a protocol implementation. A framing or quantity bug would only
  show when a real PLC meets it. The conformance tests, the pymodbus
  client as a reference and the small scope (no function code 22, no
  serial line, no TLS) limit this. Stage 2 of ADR 0045 (a real CODESYS)
  remains the final check.
- One fewer run-time dependency. No test watches library internals any
  more.
- ADR 0007, ADR 0045 and ADR 0046 each get a "Partly superseded by: ADR
  0048" line. CLAUDE.md section 4 says the slave is hand-written and that
  pymodbus is the test client.
- Next: ADR 0049 replaces `io.csv` and `io-modules.json` with one `io.json`
  file, edited from the viewer (user's request, 2026-10-13).
