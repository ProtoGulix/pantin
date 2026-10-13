# 0046. Security of the PLC bridge

- Status: accepted
- Date: 2026-10-13
- Partly superseded by: ADR 0048 (points 1, 2 and 9: the slave is our own asyncio code, so the address, the accept filter and parser faults no longer involve pymodbus; the internal-API test is gone)
- Answers: ADR 0004 ("What this filter is not": re-evaluation before any
  bridge to a real PLC)
- Applies: ADR 0004 (modes, accept filter), ADR 0007 point 2 (explicit
  listen address), ADR 0014 (Cloudflare development exposure)
- Accompanies: ADR 0045

## Context

ADR 0004 requires a new ADR before any bridge to a real PLC. ADR 0045 adds
two network surfaces:

- the tag bus, a WebSocket on the core's port;
- one Modbus TCP slave per module in the bridge.

Modbus TCP has no authentication: any client that reaches a slave can read
it and write its coils and holding registers. Pantin has no authentication
either (ADR 0004, ADR 0014).

Facts checked on 2026-10-13:

- Listen address: the core refuses public, wildcard and hostname addresses
  at start-up (`core/src/domain/network-config.ts`,
  `resolveNetworkConfig`).
- Accept filter: it accepts only private or loopback sources, narrowed by
  `--allow` (`isSourceAccepted`). It runs on accept and destroys the socket
  before any read (`core/src/http/server.ts`, `installSourceFilter`). The
  listener is per TCP connection, so it also covers an HTTP upgrade.
- Host check: it runs on requests (`core/src/http/request-handler.ts`,
  `assertAcceptedHost`), not on upgrades.
- Content type: request bodies must declare their content type
  (`http/request-reading.ts`:38), so a cross-site browser write needs a
  CORS preflight. WebSocket upgrades are not subject to CORS: a page from
  any site can open `ws://127.0.0.1:4800/...` from the user's browser. The
  browser sends that site's `Origin` and the core's own Host, so the Host
  check alone does not stop it.
- Cloudflare exposure: on the development machine, the core is reachable
  through Cloudflare → `cloudflared` → nginx → `127.0.0.1:4800`, and the
  nginx site already forwards upgrade headers (ADR 0014, consequences).
  Without a change, the tag bus would be reachable at
  `pantin-dev.frezille.fr` for anyone the Access policy lets in, and it
  would arrive from 127.0.0.1.
- Origin token: the Access token is not checked at the origin
  (docs/backlog/access-token-at-origin.md).
- pymodbus binds every interface by default (spike 0003; ADR 0007 point 2).
  Its accept filter relies on an internal handler (pymodbus 3.15.0
  `server/requesthandler.py`), measured to close the connection with 12
  unread bytes (spike 0003, B).

## Decision

1. **Where the bridge may run.** Only the two ADR 0004 modes apply:
   - `local`: Modbus slaves on 127.0.0.1, for a SoftPLC on the same host or
     reaching it through a VM port forward;
   - `lan`: one explicit private address, on a private test LAN.

   The bridge applies the core's rules itself: it refuses public, wildcard,
   link-local and hostname listen addresses at start-up with an actionable
   message, and always passes the address to pymodbus explicitly.
2. **Source filter at accept, before any read**, on every Modbus slave:
   - only private or loopback sources, narrowed by `--allow`;
   - IPv4-mapped addresses normalised;
   - the spike 0003 hook;
   - a refused source is logged with its address.

   Shared address fixtures keep the Python classification equal to the
   core's.
3. **`lan` needs an allow list for Modbus.** In `lan` mode the bridge
   refuses to start without at least one `--allow` entry. Modbus has no
   authentication, so the address of the PLC is the only control there is.
   This is stricter than ADR 0004 point 4, which leaves the list optional
   for the core.
4. **Connection limits.** Each module accepts at most 4 simultaneous
   connections; the next one is closed at accept. A flood therefore cannot
   exhaust the bridge's sockets.
5. **The tag bus follows the core API's rules.** It listens where the API
   listens, on the same server.
   - Before `handleUpgrade`, the upgrade handler applies the Host check and
     then an Origin check.
   - An `Origin` header, when present, must be `http://` plus one of the
     accepted hosts. A missing Origin is a non-browser client (the bridge)
     and is accepted.
   - Refusals answer 403 (Origin) or 421 (Host) and close the socket.
6. **The `plc` role is accepted from the core's own host only**: from
   loopback, or from the core's listen address when the core runs in
   `lan` mode (it then listens on that private address alone, ADR 0004
   point 1, so a bridge on the same host connects from it). The bridge
   runs on the core's host in phase 7. A `plc` hello from any other source
   is refused (close 4005). This narrows who can trigger the watchdog zeroing
   or impersonate the PLC. It is not a strong control: any local process
   can still connect.
7. **Never through Cloudflare.**
   - Modbus is never proxied by nginx, `cloudflared` or any TCP tunnel.
   - The tag bus is not reachable through the ADR 0014 exposure. The nginx
     site in `deploy/dev-exposure/` answers 403 for
     `^/api/pantins/[^/]+/bus/*$` (the core ignores empty path segments,
     so `/bus/` reaches the bus too), and forwards no `Upgrade` header. It also sets
     `X-Pantin-Exposure: cloudflare` on every proxied request, replacing
     any incoming value. The core refuses a bus upgrade that carries this
     header, so a later nginx edit that drops the location rule still
     fails closed.
   - Lifting this needs the Access token check at the origin
     (docs/backlog/access-token-at-origin.md) built first, and a new ADR.
   - REST and SSE through Cloudflare are unchanged.
8. **The bridge talks to the core in clear text.** `--core` must be an
   `http://` URL on a loopback address, or on the core's private listen
   address when the core runs in `lan` mode. There is no TLS in phase 7,
   which is acceptable because the bridge runs on the core's host
   (point 6).
9. **Privileges.**
   - The bridge runs as an unprivileged user.
   - Default ports are 1502 and up. Port 502 is never the default, and
     `CAP_NET_BIND_SERVICE` or a lowered `ip_unprivileged_port_start` stays
     a user decision (spike 0003, C).
   - The bridge is a separate process (ADR 0007), so a parser fault in
     pymodbus stops the bridge, not the core. The core's watchdog
     (ADR 0045 point 11) then sets the bit commands to 0.
10. **What a malicious client on the test LAN can do, and why it is
    accepted.**
    - **Through Modbus** (only from an allowed source, which is spoofable
      on a shared segment, ADR 0004):
      - it can write coils and holding registers, so commands that are not
        forced change and the simulated machine moves;
      - it can read feedback and flood the bridge, up to point 4.
    - **Through the bus or REST** (any accepted LAN source): it can force
      and release tags and read state, as REST already allows today.
    - **No real actuator is reached**: Pantin's outputs drive simulated
      joints only.
    - **The real risk is on the PLC side.** A PLC trusts Pantin's
      feedback. A PLC under test must therefore never drive live outputs
      at the same time: a SoftPLC, or a controller with its field I/O
      disconnected. This goes in the bridge README and the `pantin gvl`
      header.

    For a simulator on a test LAN, where the worst outcome is a wrong
    simulated motion or a stopped bridge, this is accepted. A production
    network, a PLC that drives live I/O, or a shared LAN needs a new ADR:
    authentication, Modbus/TCP Security or OPC UA security, segmentation.

## Rejected alternatives

- **Modbus/TCP Security** (TLS, port 802): CODESYS slave-side support and
  certificate handling are NOT VERIFIED. TLS also protects nothing on
  loopback, which is the main case.
- **A shared secret in `hello`**: it protects the bus but not Modbus, and
  adds secret storage. It is worth revisiting with the origin token check.
- **A separate port for the bus**: more configuration under the same rules.
  The Origin and Host checks are needed either way.
- **Exposing the bus through Cloudflare behind Access only**: the origin
  does not check the token (ADR 0014), so a misconfigured tunnel or policy
  would open PLC-role writes from the internet.
- **An optional allow list in `lan` mode for Modbus**: an empty list would
  let any private host write the machine's commands.
- **Origin check by an allowlist of browser origins** (for example the
  Vite dev server): the viewer does not use the bus in phase 7. Its origin
  joins the list when the viewer moves to the bus.

## Consequences

- P1 ships:
  - the upgrade checks;
  - the `X-Pantin-Exposure` refusal;
  - the nginx site change. The user installs it by hand (ADR 0014
    point 7).
  - tests: Host refused, foreign Origin refused, missing Origin accepted,
    exposure header refused, `plc` role refused from a source other than
    loopback or the core's listen address, and accepted from the listen
    address when the core runs in `lan` mode.
- P3 ships the listen-address refusal, the `lan` allow-list requirement,
  the connection limit and accept-filter tests, and the loud internal-API
  test.
- ADR 0004 gets "Answered for the PLC bridge by: ADR 0046".
- NOT VERIFIED:
  - the source addresses CODESYS presents through VM NAT or bridge
    (spike 4b). With a VirtualBox-style NAT port forward the PLC may appear
    as 127.0.0.1, and then no allow list can tell it from local processes;
  - CODESYS's behaviour after a refused accept (reconnect rate);
  - whether python `websockets` sends no `Origin` by default (tested in P3);
  - spoofing resistance on a shared segment (weak by nature, ADR 0004).
- Docker compose (server mode) will put the bridge in another container,
  not on loopback. Point 6 and point 8 must be revisited then.
