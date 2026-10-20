# OPC UA

Phase: PLC bridge (after phase 7). ADR: 0045, 0003, 0049, 0064.

## Why

CLAUDE.md 10 plans OPC UA after Modbus TCP. It needs a second stack and a
security model (certificates), with no measured need so far.

## What

Chantier 2, after ADR 0064 (io.json version 2 already fits an `opcua_client`
module): its own ADR, an OPC UA client bridge as a separate process spawned by
the core, in TypeScript (node-opcua to evaluate) instead of asyncua, and one
`plc` connection per transport (ADR 0064 point 8).
