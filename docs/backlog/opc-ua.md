# OPC UA

Phase: PLC bridge (after phase 7). ADR: 0045, 0003, 0049.

## Why

CLAUDE.md 10 plans OPC UA after Modbus TCP. It needs a second stack and a
security model (certificates), with no measured need so far.

## What

Its own ADR, then a second server in the bridge (asyncua, CLAUDE.md 4)
reading the same io.json. Not before a real request.
