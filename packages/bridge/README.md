# pantin-bridge

Bridges a Pantin core to a PLC: one Modbus TCP slave per module of the Pantin's
`io.json`, fed by the core's tag bus (ADR 0045, ADR 0046). Not
published; it runs from this checkout.

    ./setup.sh                      # creates .venv with the pinned requirements
    .venv/bin/python -m pantin_bridge --core http://127.0.0.1:4800 --pantin <id>

Usually the core starts it (ADR 0050): run the core with
`--bridge-python packages/bridge/.venv/bin/python` (`pnpm serve` passes it),
then use the bridge bar at the top of the viewer's I/O view to start, stop or
restart it, locally or on the private network with an allow list. The command
above stays for tests and debugging; the core refuses to start a second bridge
while one started by hand is connected.

- The Modbus TCP slave is written by hand on asyncio (ADR 0048): no Modbus
  library at run time, `websockets` is the only dependency. Function codes
  1 to 6, 15, 16 and 23; exception 1 for another function code, 2 outside the
  mapped range, 3 for a bad quantity or byte count, 11 for another unit id.
  `modbus_frames.py` (framing) and `modbus_pdu.py` (requests) are pure;
  `modbus_server.py` owns the sockets. `pymodbus` and `hypothesis` are in
  `requirements-dev.txt` for the tests only.
- Slaves listen on `127.0.0.1` by default. `--listen` takes one private address
  and then requires at least one `--allow <ip or cidr>`. Public, wildcard,
  link-local and hostname addresses are refused.
- A connection from a source outside the private ranges and the allow list is
  closed at accept, before any read. At most 4 connections per module. A
  malformed frame header (protocol id, length) closes the connection.
- `--status-lines` (ADR 0050) makes a supervising process able to follow the
  bridge: JSON lines on stdout, each flushed and at most 4 KiB, everything
  else stays on stderr. `{"event":"ready","listen":...,"modules":[{"key":...,"port":...}]}`
  comes once every slave is bound. `{"event":"exiting","kind":...,"message":...}`
  comes just before a non-zero exit; `kind` is `configuration`,
  `core_unavailable`, `mapping_not_valid`, `mapping_changed`, `bus_closed`,
  `protocol` or `unexpected`. The lines are held by
  `packages/protocol/fixtures/bridge-status-lines.json`. Without the flag
  nothing is written to stdout.
- SIGTERM stops the slaves, closes the bus and exits 0, with no `exiting` line.
  It works with or without the flag, and it is the only signal the core sends.
  SIGINT (Ctrl-C in a terminal) exits 130 with no `exiting` line. Where the
  event loop has no signal handlers (Windows), SIGTERM is not handled and the
  bridge still runs. `python -I -m pantin_bridge` imports from
  the venv, as the core starts it.
- The bridge does not reconnect: when the bus closes or the mapping changes it
  exits non-zero and must be started again.
- Modbus has no authentication. A PLC under test must never drive live outputs
  at the same time: use a SoftPLC, or a controller with its field I/O
  disconnected (ADR 0046 point 10).

`./check.sh` runs format, lint, strict type check and tests (`pnpm check` runs
it).
