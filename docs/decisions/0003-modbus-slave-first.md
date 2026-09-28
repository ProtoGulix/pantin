# 0003. Modbus TCP: the simulator is a slave first

- Status: accepted (per-module addressing details pending spike 4)
- Date: 2026-09-28

## Context

CLAUDE.md section 10.2 leaves two roles open for Modbus TCP: the simulator
polls the PLC (client), or it impersonates I/O modules that the PLC polls
(slave). The user decided on 2026-09-28 that the slave role comes first.

## Decision

1. The bridge exposes simulated I/O modules as Modbus TCP slaves (servers).
   The PLC program keeps its real I/O configuration: it polls the simulated
   modules exactly as it would poll the field modules.
2. Each simulated module has its own endpoint, an IP address and a port.
   How far this can go (several ports on one host, several IP addresses on
   one host, OS rights needed, limits of CODESYS Control Win V3) is measured
   by spike 4 before the endpoint model is frozen in the protocol.
3. Endpoints listen on localhost by default (CLAUDE.md section 3.6). Binding
   to another address is an explicit per-module setting.
4. The client role stays possible: the bridge design keeps the tag mapping
   independent from the Modbus role.

## Rejected alternatives

- Client first: simpler to wire (one connection), but it forces the PLC
  program to expose its I/O as Modbus registers, so the tested program differs
  from the one commissioned on the machine.

## Consequences

- Spike 4 must produce measured figures for multi-module endpoints and the
  exchange period, not only a working exchange.
- The protocol will need an endpoint entry per module in the I/O mapping.
