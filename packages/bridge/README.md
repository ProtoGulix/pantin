# pantin-bridge

Bridges a Pantin core to a PLC: one Modbus TCP slave per module of the Pantin's
`io-modules.json`, fed by the core's tag bus (ADR 0045, ADR 0046). Not
published; it runs from this checkout.

    ./setup.sh                      # creates .venv with the pinned requirements
    .venv/bin/python -m pantin_bridge --core http://127.0.0.1:4800 --pantin <id>

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
- The bridge does not reconnect: when the bus closes or the mapping changes it
  exits non-zero and must be started again.
- Modbus has no authentication. A PLC under test must never drive live outputs
  at the same time: use a SoftPLC, or a controller with its field I/O
  disconnected (ADR 0046 point 10).

`./check.sh` runs format, lint, strict type check and tests (`pnpm check` runs
it).
