# 0004. Network exposure: local by default, private LAN at most

- Status: accepted
- Date: 2026-09-28
- Refines: CLAUDE.md section 3.6, ADR 0003 point 3

## Context

The Modbus slave role (ADR 0003) means a PLC, running in a VM or on another
machine, must reach Pantin. Opening a port is a security decision. The user
set the rules below on 2026-09-28; they are the only network opening
authorised under CLAUDE.md section 14.8.

## Decision

1. Two modes, and only two:
   - `local` (default): listen on 127.0.0.1 (and ::1).
   - `lan`: listen on one explicit private address.
2. The core refuses to start, with an actionable error, when the listen
   address is public, is a wildcard (0.0.0.0 or ::), or is not a single
   address. Private means RFC 1918 (10.0.0.0/8, 172.16.0.0/12,
   192.168.0.0/16) for IPv4, and unique local fc00::/7 for IPv6.
3. In `lan` mode, every incoming connection is checked on accept, before any
   byte is read: a source address outside the private ranges (plus loopback)
   is closed immediately and logged. IPv4-mapped IPv6 sources
   (`::ffff:a.b.c.d`) are normalised before the check.
4. An optional allowlist of IPs or CIDRs only narrows the accepted sources;
   it can never widen them beyond point 3.
5. The configuration is a JSON file in the project, validated by a Zod
   schema, editable by the UI and by the CLI through the same API.
6. Safe change: a network change applied from the UI or remotely is rolled
   back automatically after 60 seconds unless it is confirmed. A local
   emergency command (`pantin network reset`, run on the host) forces the
   `local` mode without going through the network.

## What this filter is not

- It does not replace authentication: any device on the LAN, including a
  compromised one, passes it.
- It does not replace the host firewall, which stays the first barrier.
- Source address checks are weak against spoofing on a shared segment.
- Before any bridge to a real PLC or a production network, Pantin's position
  must be re-evaluated in a new ADR (authentication, TLS or OPC UA security,
  network segmentation).

## Rejected alternatives

- Listening on 0.0.0.0 with a firewall rule: one misconfiguration exposes the
  service everywhere; refused at startup instead.
- Allowlist only, no private range check: an empty or wrong allowlist would
  silently accept public sources.

## Open points

- Link-local (169.254.0.0/16, fe80::/10) and shared address space
  (100.64.0.0/10, sometimes used by VM NAT) are refused for now. Spike 4b
  measures which source addresses a NAT or bridged VM actually presents; a
  follow-up ADR widens the list only if the measurement requires it.
- Whether the rejection can happen before any read depends on the bridge
  runtime (Node or Python library): this is an eliminating criterion of
  spike 3.

## Consequences

- Phase 2 exit criterion includes a test proving the startup refusal on a
  public or wildcard address.
- The address classification is a pure function, unit tested with IPv4,
  IPv6 and IPv4-mapped cases.
