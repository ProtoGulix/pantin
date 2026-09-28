# Spike 0003. PLC bridge runtime (Python or Node) and local multi-module Modbus slave

- Date: 2026-09-28
- Covers: CLAUDE.md section 12 spike 3, and spike 4a (local part of spike 4).
  Spike 4b (real CODESYS Control Win V3, VM NAT or bridge) is not covered.
- Question: which runtime should host the Modbus TCP slave bridge, measured on
  latency, CPU, and the ADR 0004 eliminating criterion (reject a connection by
  source IP at accept time, before any byte is read)? Can one process simulate
  several I/O modules, one port or one IP per module?
- Verdict: **no candidate is eliminated.** pymodbus, jsmodbus and modbus-serial
  can all reject by source IP before reading; only jsmodbus does it through a
  public API. pymodbus and jsmodbus are equivalent on latency (both p99 about
  1 ms or less, far below a 10 ms PLC cycle); modbus-serial adds a constant
  ~1.3 to 2 ms per request. One process hosts 4 (and 32) modules on either
  layout. Recommendation (opinion, section Recommendation): **Node, jsmodbus,
  in a separate bridge process**, which keeps one language.

## Setup

- Host: KVM guest, 16 vCPU on an Intel Core i3-10100 host, Debian (Linux
  6.12.63), shared with other running services (vite, grafana, redis). No CPU
  pinning. Loopback only: every server bound to 127.0.0.0/8, all were stopped.
- Node v24.21.0 (nvm), npm 11.19.0. Python 3.13.5, throwaway venv.
- Libraries, installed only in the session scratch directory, not in Pantin:

| Library | Version | Licence | Last release | Types | Maintenance signal (GitHub API, 2026-09-28) |
| --- | --- | --- | --- | --- | --- |
| pymodbus (PyPI) | 3.15.0 | BSD-3-Clause | 2026-08-13 | `py.typed` | 2.8k stars, 1 open issue, monthly releases (3.13.1 June, 3.14.0 July, 3.15.0 Aug) |
| jsmodbus (npm) | 5.0.0 | MIT (package.json; no LICENSE file in the repo) | 2026-09-14, previous 4.0.10 on 2023-12-21 | bundled `.d.ts` (written in TS) | 512 stars, 22 open issues, sparse commits (2024-09, then 2026-05), Travis/tslint tooling |
| modbus-serial (npm) | 8.0.25 | ISC | 2026-03-20 | hand-written `index.d.ts` | 732 stars, 121 open issues; pulls `serialport` 13 (native, install script) as optional dep |
| ws (npm) / websockets (PyPI) | 8.22.0 / 17.1 | MIT / BSD-3-Clause | 2026-09 | yes | tag bus stand-ins only |

Sources: `npm view <pkg>` (registry.npmjs.org), `pip index versions` and
https://pypi.org/pypi/pymodbus/json, https://api.github.com/repos/{pymodbus-dev/pymodbus,
Cloud-Automation/node-modbus, yaacov/node-modbus-serial}. Also listed on npm but
discarded: modbus-stream 0.46.0, node-modbus 4.3.1, modbus-tcp 0.4.13 (no release
since 2022 or earlier), modbus-rs 0.16.1 (GPL-3.0-only, Rust native binding).

Server APIs: pymodbus `ModbusTcpServer(context, address=(host, port))` plus
`await serve_forever(background=True)` (asyncio); its default `address=("", 502)`
binds all interfaces, so Pantin must always pass it. Its datastore classes
(`ModbusDeviceContext`, `ModbusServerContext`) log "deprecated, removed in v4"
while the replacement `SimDevice` is marked "experimental" in 3.15.0. jsmodbus
`new server.TCP(netServer, {coils, discrete, holding, input})`: the caller owns
the `net.Server` and register Buffers. modbus-serial `new ServerTCP(vector,
{host, port, unitID})`: per-address callbacks, its own internal `net.Server`, and
every request deferred with `setTimeout(..., 0)`.

## Results

### B. Reject by source IP before any read (ADR 0004 point 3)

Test: server listens on 127.0.0.2:15100 and allows only 127.0.0.3. Clients
connect from 127.0.0.1 (default source), from 127.0.0.3 and 127.0.0.4 (bound
source), and immediately send a valid FC04 request. To make "before any read"
provable, the server was also frozen with SIGSTOP while the client connected and
sent, then resumed, so the request bytes were already in the kernel buffer at
accept time.

| Candidate | Hook used | Clean or workaround | 127.0.0.1 / .4 | 127.0.0.3 | Proof of no read |
| --- | --- | --- | --- | --- | --- |
| pymodbus 3.15.0 | subclass `ModbusTcpServer.callback_new_connection` to return a subclass of `ServerRequestHandler` whose `connection_made` checks `transport.get_extra_info("peername")`, then `transport.abort()` | workaround on internals (`ServerRequestHandler`, `active_connections` must be cleaned by hand); `trace_connect` only gets a bool, no address | closed | answered | `FIONREAD` = 12 unread bytes at rejection, 0 bytes reached `callback_data`, client got ECONNRESET |
| jsmodbus 5.0.0 | own `net.Server` `connection` listener; accepted sockets forwarded to jsmodbus through a proxy `EventEmitter` | clean, public constructor argument (needs a cast in TS: typed `Server \| ModbusServer`) | closed | answered | `socket.bytesRead` = 0, client got ECONNRESET |
| modbus-serial 8.0.25 | `server._server.prependListener("connection", gate)` | workaround on a private field (`_server`, not in the typings) | closed | answered | `socket.bytesRead` = 0, client got ECONNRESET |

- Why it holds: Node emits `connection` before libuv reads; asyncio calls
  `connection_made` before registering the reader. ECONNRESET (not EOF) confirms
  the kernel still held unread data at close.
- IPv4-mapped sources: Node servers bound to `::ffff:127.0.0.2` saw sources as
  `::ffff:127.0.0.1` / `::ffff:127.0.0.3`; after normalisation the same
  decisions were taken (measured, both Node libraries). asyncio refuses to bind
  `::ffff:127.0.0.2` (EINVAL: it forces `IPV6_V6ONLY` on IPv6 sockets), so a
  pymodbus server never sees mapped sources; Python's
  `ipaddress.IPv6Address.ipv4_mapped` normalises `::ffff:127.0.0.3` and
  `::ffff:7f00:3` correctly (unit check only).
- Bonus: Node 24 `net.createServer({ blockList })` drops listed sources before
  `connection` (measured: 0 connection events). It is a deny list only, so it
  cannot express "private ranges plus allowlist"; a `connection` gate is still
  needed.

### C. Multi-module slave (spike 4a, local)

Each module: 64 coils, 64 discrete inputs, 64 holding and 64 input registers.
"Ready" is wall time from process spawn to all endpoints listening; RSS after
1 s idle; every endpoint probed with an FC04 read.

| Candidate | Layout | Endpoints | Ready (ms) | RSS (MB) | Threads | Answered |
| --- | --- | --- | --- | --- | --- | --- |
| pymodbus | ports 127.0.0.1:15020-15023 | 4 | 88 | 22.8 | 1 | 4/4 |
| pymodbus | IPs 127.0.0.2-.5:15020 | 4 | 89 | 22.8 | 1 | 4/4 |
| pymodbus | ports 15100-15131 | 32 | 93 | 23.0 | 1 | 32/32 |
| jsmodbus | ports / IPs / 32 ports | 4 / 4 / 32 | 63 / 66 / 67 | 61.4 / 62.0 / 61.5 | 7 | all |
| modbus-serial | ports / IPs / 32 ports | 4 / 4 / 32 | 63 / 63 / 62 | 62.6 / 62.2 / 62.2 | 7 | all |

- Bare Node process: 46 MB RSS, bare Python 8.5 MB; per-module cost is negligible.
- Port 502: `net.ipv4.ip_unprivileged_port_start` = 1024 on this host. Binding
  127.0.0.1:502 as a normal user fails with EACCES (Node: `EACCES`; pymodbus
  swallows it into "Could not start listen, please check address"). Meaning for
  CODESYS: a Modbus TCP slave device in CODESYS usually targets port 502, but
  the port is configurable per slave in the device configuration (NOT VERIFIED
  on Control Win V3, spike 4b). If 502 is required, options are one IP per
  module on port 502 with `CAP_NET_BIND_SERVICE` or a lowered
  `ip_unprivileged_port_start` on Linux; on Windows ports below 1024 are not
  privileged (NOT VERIFIED here). Either needs a user decision, not code.
- One IP per module works unprivileged on loopback (127.0.0.0/8 is local); on a
  LAN it needs interface aliases (admin rights), a spike 4b question.

### D. Latency and CPU (PLC-like polling)

Client: one raw-socket Node master per module (same client for all servers),
one TCP connection, sequential FC01 read 16 coils, FC04 read 4 input registers,
FC15 write 16 coils per cycle, 60 s per run, runs sequential. Every read-back of
the coils was checked against the previous write. Latency in ms per request
(p50 / p95 / p99 / max, module 1); CPU = server process CPU time / wall time.

| Candidate | Scenario | Cycles | Errors | Request p50 / p95 / p99 / max | Cycle p99 | Server CPU | RSS MB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pymodbus | 1 module @10 ms | 6000 | 0 | 0.26 / 0.50 / 0.58 / 5.2 | 1.4 | 6.8 % | 22.8 |
| pymodbus | 1 module @20 ms | 3001 | 0 | 0.31 / 1.25 / 1.40 / 2.0 | 3.9 | 5.1 % | 22.8 |
| pymodbus | 4 modules @10 ms | 24002 | 0 | 0.28 / 0.69 / 0.93 / 5.8 | 2.7 | 24.7 % | 22.9 |
| jsmodbus | 1 module @10 ms | 5998 | 0 | 0.59 / 0.80 / 1.00 / 15.3 | 3.0 | 9.0 % | 67.2 |
| jsmodbus | 1 module @20 ms | 3001 | 0 | 0.61 / 0.88 / 1.14 / 5.5 | 3.4 | 4.9 % | 66.9 |
| jsmodbus | 4 modules @10 ms | 24001 | 0 | 0.52 / 0.73 / 0.84 / 6.1 | 2.4 | 26.9 % | 68.5 |
| modbus-serial | 1 module @10 ms | 6000 | 0 | 1.95 / 2.16 / 2.40 / 6.1 | 7.1 | 14.9 % | 70.0 |
| modbus-serial | 1 module @20 ms | 3001 | 0 | 1.99 / 2.21 / 2.50 / 7.9 | 7.4 | 8.0 % | 68.0 |
| modbus-serial | 4 modules @10 ms | 23998 | 0 | 1.81 / 2.33 / 2.61 / 11.2 | 6.8 | 29.6 % | 74.1 |

- Errors: 0 timeouts, exceptions, read-back mismatches or disconnects in all
  runs. The client started 1 to 10 cycles late per run (client timer jitter).
- Run-to-run variance is large on this shared VM. Two repeat runs of
  "1 module @10 ms" (20 s each) gave request p50 / p99 of: pymodbus 1.16 / 1.58
  (CPU 24 %), jsmodbus 0.70 / 1.14 (CPU 12 %), modbus-serial 2.01 / 2.56 (CPU
  16 %); a 3 s smoke run gave pymodbus 0.29 / 0.65 and jsmodbus 0.19 / 0.52.
  Conclusion supported by all runs: pymodbus and jsmodbus are in the same
  sub-2 ms band with no stable winner; modbus-serial is always about 1.3 to 2 ms
  slower per request (its `setTimeout(…, 0)` per request); every candidate's
  cycle p99 stays below 8 ms, so a 10 ms or 20 ms poll is sustained.
- Extra hop of the Python option: Python sidecar (websockets 17.1) writing one
  tag as JSON to a Node tag bus stand-in (ws 8.22.0) and waiting for the ack, 60 s:

| Period | Messages | RTT p50 / p95 / p99 / max (ms) |
| --- | --- | --- |
| 10 ms | 6000 | 1.15 / 1.36 / 1.55 / 5.3 |
| 20 ms | 3000 | 1.21 / 1.42 / 1.57 / 4.7 |

  This round trip is comparable to or larger than a Modbus request itself.

## Recommendation (E)

Measured facts: all candidates pass the ADR 0004 criterion; pymodbus and
jsmodbus have equivalent latency within this host's noise; the Python option
adds a tag bus hop of about 1.2 ms p50 / 1.6 ms p99 per round trip; Node costs
about 40 MB more RSS per process than Python.

Opinion:

1. Choose **Node with jsmodbus 5.0.0** for the Modbus slave. It is the only
   candidate whose accept-time filter uses a public API (Pantin owns the
   `net.Server`), it keeps one language and one toolchain (Zod types,
   Biome, Vitest), and it removes the Python hop.
2. Run it as a **separate process** (`packages/bridge`), talking to the core over
   the tag bus as CLAUDE.md section 4 already requires; the dependency rule
   forbids core importing bridge anyway. In-process would save the hop but
   couples the PLC-facing socket code with the fixed-step loop; revisit only if
   the hop is shown to matter (it did not here: 1.6 ms p99 vs a 20 to 50 ms
   exchange target).
3. jsmodbus maintenance risk is real (sparse activity, no LICENSE file in the
   repo, a two-week-old major). Mitigate: pin it, wrap it behind a small
   interface, keep modbus-serial as fallback; the TCP server side is small enough
   to vendor. pymodbus is the most active library, but its filter relies on
   internals and its datastore API is mid-migration to v4.
4. OPC UA (asyncua vs node-opcua) was not assessed and may weigh differently.

## NOT VERIFIED

- Everything with real CODESYS Control Win V3: whether its Modbus TCP master
  accepts a non-502 port per slave, its polling period and request pattern
  (sequential or pipelined, one connection per slave or not), reconnect
  behaviour after a rejected connection, timeouts (spike 4b).
- Source addresses seen through VM NAT or bridge networking, and whether one IP
  per module is practical on a LAN interface (aliases, rights) (spike 4b).
- Windows hosts (port 502 rights, 127.0.0.2+ aliases); a dedicated idle host
  (this was a noisy shared KVM guest); long runs, many connections, bad frames.
- jsmodbus 5.0.0 changes vs 4.x, its licence beyond package.json `MIT`, and
  pymodbus v4 (`SimDevice`, any connection hook) were not reviewed.

## Consequences

- ADR 0001 / stack: propose Node for the bridge (Modbus), replacing the Python
  sidecar default in CLAUDE.md section 4.3, pending user decision.
- The bridge owns its `net.Server` per endpoint; the ADR 0004 filter is one
  pure function (`classify(address)`, IPv4-mapped normalised) called in the
  `connection` event before handing the socket to the Modbus library.
- Endpoint model (ADR 0003): both "one port per module" and "one IP per module"
  work locally in one process; default to ports >= 1024 on 127.0.0.1 and let
  spike 4b decide whether 502 is needed.
- Prototype code stayed in the scratch directory; a `packages/bridge` prototype
  would need `jsmodbus` and `ws`.
