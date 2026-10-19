# Spike 4b: CODESYS Control Win V3 in a virtual machine

Phase: spikes and checks. ADR: 0003, 0004, 0045 (end), 0048, spike 0003.

## Why

The manual demo of 2026-10-18 on CODESYS Control Win V3 x64 proved the
function codes and both directions on examples/plc-cylinder. Six things were
not measured.

## What

With CODESYS in a VM, measure and report in docs/spikes:

- exchange period and latency (target 20 to 50 ms, CLAUDE.md 10, NOT VERIFIED);
- the source address Pantin sees with NAT and with a bridged network (ADR 0004
  still refuses 100.64.0.0/10);
- a port other than 502 or 1502 on a module;
- a privileged port;
- how CODESYS reconnects after Pantin refuses a connection or the slave
  closes;
- the limit of 10 channels per Modbus device reported on forums.
