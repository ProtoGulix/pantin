# 0007. PLC bridge: separate Python process with pymodbus

- Status: accepted
- Date: 2026-09-28
- Source: spike 0003 (docs/spikes/0003-plc-bridge-and-modbus-slave.md)

## Context

Spike 0003 compared pymodbus 3.15.0, jsmodbus 5.0.0 and modbus-serial 8.0.25
as Modbus TCP slaves hosting several simulated I/O modules. All three can
reject a connection by source address before reading it (ADR 0004). No stable
latency winner emerged between pymodbus and jsmodbus on the test machine.
The user decided on 2026-09-28.

## Decision

1. The PLC bridge is a separate Python process using pymodbus (BSD-3-Clause),
   connected to the core through the tag bus (WebSocket), as planned in
   CLAUDE.md section 4.3.
2. pymodbus is pinned to an exact version. Its default listen address binds
   every interface, so the bridge always passes an explicit address that has
   gone through the ADR 0004 checks; a test proves it.
3. Source filtering relies on subclassing a pymodbus internal request
   handler. This is internal API: it is covered by a dedicated test that
   fails loudly on a pymodbus upgrade.
4. Python code follows CLAUDE.md section 8: ruff, strict type checking,
   pytest, annotations everywhere, wired into `pnpm check` when the bridge
   package gets its first code.

## Rejected alternatives

- jsmodbus 5.0.0: the cleanest accept-time filter and one language for the
  whole project, but its repository ships no LICENSE file despite "MIT" in
  package.json, and it had no release between 2023-12 and 2026-09. Reconsider
  if the repository stabilises and provides a licence file.
- modbus-serial 8.0.25: 1.3 to 2 ms slower per request (timer delay), filter
  only through a private field, pulls a native optional dependency.
- Bridge inside the core process: couples PLC network I/O to the simulation
  loop, against the isolation goal of CLAUDE.md section 3.1.

## Consequences

- The measured tag bus hop adds about 1.2 ms (p99 1.55 ms) per round trip,
  well inside the 20 to 50 ms exchange target.
- pymodbus's datastore API is moving to v4 (current classes deprecated,
  replacement experimental): isolate it behind one module of the bridge.
- Port 502 needs privileges; whether CODESYS Control Win V3 accepts another
  port is measured in spike 4b.
