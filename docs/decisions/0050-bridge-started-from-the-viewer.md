# 0050. The core starts and stops the PLC bridge

- Status: accepted
- Date: 2026-10-14
- Applies: ADR 0004 (modes, private ranges), ADR 0046 (bridge security),
  ADR 0009 point 2 (interpreter passed by a flag), ADR 0015 and ADR 0032
  point 9 (status on the pose stream), ADR 0049 point 7 (a mapping edit stops
  the bridge)
- Extends: ADR 0045 point 10 (the bridge command line gains `--status-lines`),
  ADR 0045 P5 (bridge status in the viewer)
- Interprets: ADR 0004 point 6 (see Decision point 6; confirmed by the user
  on 2026-10-14)

## Context

Today the user starts the bridge by hand in a terminal:
`packages/bridge/.venv/bin/python -m pantin_bridge --core <url> --pantin <id>
--listen <address> [--allow <ip or cidr>]...`. The user asked on 2026-10-14
to start and stop it from the viewer.

Facts checked in the repository on 2026-10-14 (branch `feat/plc-cylinder-p7`):

- **The step-converter precedent.**
  - `core/src/main.ts` takes `--step-converter-python`, and prints "STEP
    import disabled" without it.
  - `http/server.ts` passes Node's `spawn` to the converter.
    `converter/process-runner.ts` starts it with an argument array,
    `shell: false` and `stdio: ["ignore", "pipe", "pipe"]`. It stops it with
    SIGTERM, then SIGKILL after a grace delay.
  - `pnpm serve` passes the venv interpreter, and vitest reads
    `PANTIN_STEP_CONVERTER_PYTHON`.
- **The bridge command line** (`bridge/src/pantin_bridge/cli.py`).
  - `--listen` defaults to 127.0.0.1.
  - Exit codes: 2 for a configuration error, 1 for any other `BridgeError`,
    130 on SIGINT. The error message goes to stderr as `pantin-bridge: ...`.
  - Logs go to stderr (`logging.basicConfig`). Nothing is written to stdout.
  - There is no SIGTERM handler. Python only installs SIGINT
    (KeyboardInterrupt) and SIGPIPE handlers, so SIGTERM ends the process
    without running `finally` blocks (Python `signal` module documentation).
- **When the bridge exits.**
  - On `io_changed` it raises `RestartRequiredError` (`bridge.py`).
  - When the bus closes, it exits too (ADR 0045 point 10).
  - A port it cannot bind raises `ConfigurationError`: "the port is taken, or
    this user may not bind it" (`modbus_server.py`).
- **Checks the bridge already makes.** `--core` must be `http://` to a
  loopback or private address, and proxies are ignored (`core_endpoint.py`).
  `resolve_listen_address` refuses public, wildcard, link-local and hostname
  addresses, and a private address without `--allow` (ADR 0046 points 1
  and 3).
- **The core's bus.** It accepts one `plc` connection per Pantin (4002), only
  from loopback or the core's listen address (4005, `bus/bus-hello.ts`).
  `OpenPantin.bridgeConnected` is set by the bus. `plc_status` is logged as a
  console event but no per-module state is kept (`service/bus-operations.ts`).
- **No route closes or deletes a Pantin.** A loaded Pantin stays loaded until
  `service.close()` at core shutdown (`service/pantin-service.ts`,
  `closePantins`). The viewer's File > Close (`controller/menu-commands.ts`,
  `requestClose`) is client-side only.
- **The pose stream** carries `pose` and `clock` events (ADR 0032). Routes
  that change something use a `PUT` with the wanted state, as
  `PUT .../clock {running}` does (`http/clock-routes.ts`).
- **Shutdown.** `main.ts` installs no SIGINT or SIGTERM handler.
- **No server mode exists yet.** It means docker compose (ADR 0001).
  ADR 0046's Consequences already say the bridge will then run in its own
  container.

NOT VERIFIED:

- Whether `python -I` still loads the `pantin_bridge.pth` file that `setup.sh`
  writes into the venv's site-packages. `-I` skips the user site, not site
  itself, as recalled; a P1 test settles it.
- The source address a bridge on the same host presents when it connects to
  the core's private listen address. ADR 0046 point 6 assumes it is that
  address.
- What signals do when the core runs on Windows. Node's `kill` there is a
  forced termination, as recalled; no Windows host has been tested.
- Every point already NOT VERIFIED in ADR 0045 and ADR 0046: CODESYS through
  NAT or a bridged VM, its reconnection, and port 1502. With a NAT port
  forward the PLC may appear as 127.0.0.1, and then `local` mode may be
  enough.

## Decision

1. **The core spawns the bridge, as a supervised child process.**
   - One bridge per open Pantin, keyed by Pantin id (CLAUDE.md 1.4). Nothing
     in this design assumes a single Pantin per core.
   - A new flag, `--bridge-python <python of the bridge venv>`, works like
     `--step-converter-python`.
     - Without it, the feature is off: `GET .../bridge` answers
       `availability: "unavailable"`, and `PUT` answers a new API error code,
       `bridge_unavailable`.
     - With it, `main.ts` checks that the path is an existing file and
       otherwise refuses to start, with a message naming
       `pnpm setup:python`. It prints "PLC bridge: <path>" or "PLC bridge
       disabled (no --bridge-python)".
   - `pnpm serve` passes `packages/bridge/.venv/bin/python`. Tests read
     `PANTIN_BRIDGE_PYTHON`.
   - The command is fixed. Only `listen` and `allow` come from the request,
     and only after point 4:

         <python> -I -u -m pantin_bridge --status-lines
           --core http://<core address>:<core port> --pantin <id>
           --listen <address> [--allow <entry>]...

     - It is an argument array with `shell: false`, never a shell string.
     - `-I` ignores `PYTHON*` variables and the user site. `-u` makes the
       output unbuffered. The child inherits the core's environment.
     - `--core` is the core's real bound address and port (`server.address()`):
       loopback in `local` mode, the listen address in `lan` mode
       (ADR 0046 point 8).
     - The interpreter path comes only from the host's command line, never
       from the API or a Pantin folder.
   - A manual bridge started in a terminal keeps working unchanged. The
     closed-loop test of ADR 0045 P4 still uses one.
2. **A stdout contract for the bridge (`--status-lines`).**
   - Without the flag, the bridge's output is unchanged.
   - With it, the bridge writes JSON lines to stdout. The core validates each
     one with a Zod schema (CLAUDE.md 8):
     - `{"event": "ready", "listen": "127.0.0.1", "modules": [{"key": "m1", "port": 1502}]}`,
       once every slave is bound;
     - `{"event": "exiting", "kind": "<kind>", "message": "<actionable text>"}`,
       just before a non-zero exit.
   - `kind` is one of: `configuration`, `core_unavailable`,
     `mapping_not_valid`, `mapping_changed` (on `io_changed`), `bus_closed`,
     `protocol`, `unexpected`. This splits today's `RestartRequiredError` into
     `mapping_changed` and `bus_closed`.
   - Each stdout line is at most 4 KiB. A line over that, or not valid JSON,
     is treated as a log line.
   - **SIGTERM** gets a handler that stops the slaves, closes the bus and
     exits 0 with no `exiting` line. The PLC side then sees closed
     connections, and the core sees `bridge_disconnected`, which zeroes the
     bit commands (ADR 0045 point 11).
   - stderr stays human logs. The core copies each line to its own stderr,
     prefixed `[bridge <pantinId>]`, and keeps the last 20 lines, each cut to
     500 characters.
3. **State machine**, one per Pantin. It is a pure function from state and
   event to state. The process adapter is the only effectful part, and
   `spawn` is injected.

   | From | Event | To |
   | --- | --- | --- |
   | stopped, failed | start request, checks passed | starting |
   | starting | `ready` line | running |
   | starting | exit, spawn error, or no `ready` within 15 s (then SIGTERM) | failed |
   | starting, running | stop request (SIGTERM, then SIGKILL after 3 s) | stopping |
   | stopping | exit | stopped |
   | running | exit without a stop request | failed |

   - `failed` carries `failure: {kind, message, exitCode, signal}`.
   - Kinds the core adds itself:
     - `spawn_failed`: the interpreter cannot be run (ENOENT, EACCES);
     - `start_timeout`;
     - `crashed`: an exit with no `exiting` line, for example a traceback or
       SIGKILL. Its message gives the exit code or signal and points to the
       log lines.
   - **No automatic restart.** A crash is a bug or a configuration problem
     that a retry does not fix, and a restart loop would make the PLC see a
     flapping slave. The user restarts with one click (point 8).
   - In the console, a `failed` state writes a new code, `bridge_failed`
     (error, params `kind`, `message`). The status only holds the last
     failure; the console keeps the history. `bridge_connected` and
     `bridge_disconnected` are unchanged.
4. **Checks before any spawn.** They are pure functions in core and reuse
   `domain/network-address.ts`. The bridge still makes its own checks as a
   second line.
   - **listen**:
     - one literal address, loopback or private (ADR 0004 point 2);
     - wildcard, public, link-local and hostnames are refused;
     - the address must also be one of the host's own interface addresses.
       Interfaces are read through an injected function wrapping
       `os.networkInterfaces()`. This turns a bind failure into a 400 with
       the list of choices.
   - **allow** (1 to 16 entries in `lan`, ignored in `local`):
     - each entry is an IP or CIDR, parsed by `parseCidr`;
     - each entry must lie inside the loopback or private ranges. An entry
       outside them could never match (ADR 0004 point 4), so it is refused as
       a mistake.
     - `lan` with no entry is refused (ADR 0046 point 3).
   - **Mapping**: `GET .../io` status must be `valid`. Otherwise the answer
     is 409 with the first problems, as in the bridge's
     `require_valid_mapping`.
   - **Slot**: the answer is 409 if this Pantin already has a supervised
     bridge that is not stopped or failed, or if `bridgeConnected` is true (a
     bridge started outside Pantin holds the `plc` slot).
   - **Ports**: 409 if a module's (listen, port) pair equals the core's own,
     or one held by another supervised bridge. The message names the other
     Pantin. A port taken by an unrelated program is only found at bind time
     (avoiding a check-then-bind race) and shows as `configuration` with the
     bridge's message.
   - **Cap**: at most 4 supervised bridges per core, so a client cannot fork
     processes without limit.
   - **Exposure**: `PUT .../bridge` answers 403 when the request carries
     `X-Pantin-Exposure: cloudflare` (ADR 0046 point 7). A process is never
     started or stopped from the internet. `GET` is allowed.
5. **Routes and status.**

   | Route | Body | Effect |
   | --- | --- | --- |
   | `GET .../bridge` | none | `BridgeStatus` |
   | `PUT .../bridge` | `{"running": true, "listen": "127.0.0.1", "allow": []}` | start; 200 with `starting` |
   | `PUT .../bridge` | `{"running": false}` | stop; 200 with `stopping`, or the current state when already stopped or failed |

   - The body is a union on `running`, parsed by Zod in the protocol.
     Unknown fields are refused.
   - `BridgeStatus`:
     - `availability`;
     - `state`;
     - `network`: `{listen, allow}` of the current or last start, or null;
     - `modules`: `[{key, port, plcConnected}]` while running.
       `plcConnected` comes from the `plc_status` the core already receives;
       the core now keeps it per module.
     - `failure`;
     - `log`: the last stderr lines;
     - `externalBridgeConnected`;
     - `listenChoices`: 127.0.0.1, then the host's private addresses.
   - **To the viewer**: a third SSE event, `bridge` (ADR 0015, ADR 0032
     point 9), sent when the stream opens and on every change of
     `BridgeStatus`, including `plcConnected`. The viewer validates it with
     the protocol schema.
6. **Network policy.**
   - The default and pre-selected choice is `local` (127.0.0.1).
   - `lan` is an explicit choice for each start, with an allow list. It is
     never persisted:
     - not in io.json, because listen and allow are machine settings
       (ADR 0045 point 6);
     - not on disk at all. The core keeps the last network per Pantin in
       memory for Restart, and every core start begins in `local`.
   - The bridge mode is independent of the core mode. A core in `local` with
     a bridge in `lan` is the expected case: a viewer on the host, and a
     CODESYS VM on a host-only or bridged network.
   - **ADR 0004 point 6** (rollback after 60 s without confirmation) is read
     as covering changes to the core's own listen address, where a mistake
     locks the user out. Opening a bridge in `lan` changes nothing lasting
     and cannot cut the viewer off. So no confirmation timer is added. The
     user confirmed this reading on 2026-10-14 (CLAUDE.md 14.8).
   - **Server mode** (docker compose, CLAUDE.md 3.6 and 11.3):
     - the feature stays off because compose does not pass `--bridge-python`;
     - ADR 0046's Consequences already plan a separate container there, which
       this spawn model does not cover;
     - a server-mode ADR decides, not this one.
   - **CLAUDE.md 11.3** (no community code without a sandbox) is not engaged.
     The bridge is first-party code from the checkout, and no Pantin folder
     content reaches the command line. io.json ports reach the bridge only
     through the validated `GET .../io`.
7. **Lifecycle.**
   - **Mapping or tag change while running**: the bridge exits on
     `io_changed` (ADR 0049 point 7). The state becomes `failed` with kind
     `mapping_changed`, and the viewer shows it as a warning with Restart.
     Automatic restart stays in `docs/backlog/bridge-reconnection.md`.
   - **Discard** changes `mappingId`, so it has the same effect. **Reset**
     sends a `snapshot` and does not stop the bridge.
   - **Pantin closed in the viewer**: the bridge keeps running, because the
     core keeps the Pantin loaded and simulating. The close confirmation
     says so and offers "Stop the bridge and close". That is a `PUT
     {running: false}` sent by the viewer, with no logic of its own.
   - **Core shutdown**: `close()` stops every supervised bridge (SIGTERM,
     then SIGKILL after 3 s) before closing the server. `main.ts` gains
     SIGINT and SIGTERM handlers that call `close()`, then exit.
   - **If the core dies without closing**: the bridge's bus closes, and the
     bridge exits on its own (`bus_closed`). Its ports are then released.
   - **Port conflicts**: see point 4. A bind failure reaches the UI as the
     bridge's own message: "Change the module's port in io.json".
8. **Viewer: a bridge block** (ADR 0049 point 11). Amended on 2026-10-14:
   it sits at the bottom of the left side panel, in every layout, not at the
   top of the `io` view (see "Amendment" below). It is shown in view and
   edit modes, because starting the bridge is a runtime action like the
   clock, not a document edit. It is a pure view model (status in, view
   state out), with labels in French and English.
   - **State chip**: Stopped, Starting…, Running, Stopping…, Failed.
   - **Network**:
     - a choice between "Local only (127.0.0.1)" and "Private network";
     - the latter shows a select of `listenChoices` and an allow-list field
       (IPs or CIDRs);
     - both are locked while the bridge runs.
   - **Button**: Start, Stop, or Restart after a failure, which reuses the
     last network.
   - **Running**: one line per module, for example "m1 → 127.0.0.1:1502 ·
     PLC connected / waiting for the PLC". While running, a hint says that
     any I/O edit stops the bridge.
   - **Failed**: a translated headline for the `kind`, the bridge's message
     (in English), and a folded "Bridge log" with the last lines.
   - **Unavailable**: the controls are disabled, with "Start the core with
     --bridge-python <path> (pnpm setup:python)".
   - **External bridge connected**: Start is disabled, with "A bridge
     started outside Pantin is connected".
   - The viewer computes nothing. Address and allow validation errors come
     back as the 400 message and are shown under the field.
9. **Slices**, one agent each:
   - **P0**: this ADR.
   - **P1, bridge (Python)**:
     - `--status-lines`, `MappingChangedError` and `BusClosedError`, and the
       SIGTERM handler;
     - pytest checks: the `ready` line after binding, an `exiting` line for
       each kind, SIGTERM exits 0 with ports released, and `-I -m
       pantin_bridge` imports from the venv.
     - Exit: `packages/bridge/check.sh` is green.
   - **P2, protocol and core**:
     - `BridgeStatus`, the `PUT` body, `bridge_unavailable`, the `bridge`
       SSE event, the `bridge_failed` console code, and the status-line
       schema with a shared fixture;
     - the pure state machine, the pure checks, the process adapter, the
       routes, `--bridge-python`, signal handling in `main.ts`, and
       `pnpm serve`.
     - Tests:
       - the state machine, exhaustively;
       - the checks: wildcard, public, link-local, hostname, a non-host
         address, `lan` without allow, an allow entry outside the private
         ranges, port clashes, the cap;
       - spawn arguments asserted with a fake spawner (array, `shell: false`,
         the fixed module);
       - 403 under the exposure header, and `bridge_unavailable` without the
         flag;
       - one end-to-end test with the real venv: start, then running, then a
         TCP connection to the module port succeeds; an io edit gives
         `mapping_changed`; stop gives stopped with the port closed;
         `close()` leaves no child process; a killed child gives `crashed`.
     - Exit: `pnpm check` is green.
   - **P3, viewer**:
     - the bridge bar, the `bridge` SSE event, the close dialog, French and
       English labels;
     - unit tests of the view model for every state, and of the intents (the
       exact `PUT` bodies).
     - Exit: `pnpm check` is green, then a demonstration: start and stop
       from the viewer on `examples/plc-cylinder`, with a pymodbus client
       reading the module.
   - **P4, documentation**: the bridge README (start from the viewer, the
     manual command kept), a CLAUDE.md section 4 line ("started by the core
     on demand, ADR 0050"), and the CHANGELOG.

## Rejected alternatives

- **A separate launcher process** (a small daemon, or a `pantin bridge`
  CLI command started by the viewer through it): a second long-lived
  process to secure and supervise, with its own API. The core already
  supervises a Python child (ADR 0009) and already knows the mapping, the
  ports and the bus slot.
- **Starting the bridge from the viewer directly**: impossible from a
  browser, and against CLAUDE.md 3.2 and 3.4.
- **Bridge in the core process** (TypeScript): rejected by ADR 0007, and
  ADR 0048 made the slave Python.
- **"running" taken from the `plc` hello on the bus**: the hello comes before
  the slaves bind (`run_bridge`), so a port conflict would show as running
  and then fail. The `ready` line comes after the bind.
- **Parsing the `pantin-bridge: ...` stderr line for the reason**: a text
  contract with no schema. stdout JSON follows ADR 0009 point 3.
- **Automatic restart after a crash, even bounded to N tries**: it does not
  fix a configuration error and makes the PLC see a flapping slave.
- **Automatic restart on `io_changed`**: during commissioning every edit
  would cut the PLC's connections, including while the mapping is briefly
  invalid. It stays in the reconnection backlog item, with its own ADR.
- **Listen and allow saved in io.json or pantin.json**: these are machine
  settings (ADR 0045 point 6). A shared Pantin folder would then open Modbus
  on another machine.
- **A per-spawn token in the bus `hello`**, passed by environment: ADR 0046
  point 6 already accepts that any local process can connect. Ownership is
  given by the `ready` line and the 4002 slot rule. A token would change the
  bus schema and its fixtures for little gain. Revisit it with the origin
  token check (ADR 0046, rejected alternatives).
- **An extra `--bridge-lan` core flag before the UI may offer `lan`**: safer
  against a viewer reached from the LAN, but such a client can already force
  tags (ADR 0046 point 10). An allow-listed Modbus port adds a surface of the
  same kind. The user chose no extra flag on 2026-10-14.
- **A 60 s confirmation for `lan` (ADR 0004 point 6)**: guards against a
  lockout that cannot happen here (point 6).

## Consequences

- The user starts, stops and restarts the bridge from the left side panel. The
  terminal command stays for tests and debugging.
- The core now runs a long-lived child process per Pantin. A supervisor bug
  could leave an orphan. This is bounded because the bridge exits when its
  bus closes, and covered by the `close()` test.
- The protocol gains `BridgeStatus`, a request schema, an API error code, an
  SSE event name and a console code. No public document schema changes
  (pantin.json, io.json), and the bus protocol is unchanged.
- The bridge gains a stdout contract held by a shared fixture, like the bus
  messages (ADR 0045 point 2).
- `main.ts` gains signal handling. It also helps the STEP converter, whose
  runs are then stopped cleanly too.
- ADR 0045 gets "Extended by: ADR 0050". ADR 0004 gets a note on point 6
  (reading confirmed by the user).
- Server mode stays undecided: a later ADR places the bridge in its own
  container.
- NOT VERIFIED: `-I` with the `.pth` file (P1), the bridge's source address in
  `lan` mode (ADR 0046 point 6), Windows signals, and every CODESYS
  measurement still pending (spike 4b).

## Amendment (2026-10-14): the bridge block in the side panel

Asked by the user after trying P3: the PLC connection state must be visible
at all times while a Pantin is open, whatever the central layout.

- The bridge block of point 8 moves to the bottom of the left side panel,
  under the tree. It is the only one: the bar at the top of the `io` view is
  removed.
- A connection card: a header with Start or Stop and a gear that opens the
  `io` layout, a coloured state, the network as a chip that unfolds its
  fields, and one line per io.json module with its connection (bridge
  stopped, waiting for the PLC, PLC connected), shown even when the bridge
  is stopped. The failure block stays. The I/O view's module list shows the
  same dots. The viewer reads io.json whenever a Pantin is open.
- The `io` choice leaves the top toolbar; the View menu keeps it.
- Viewer only: the core already pushes the status in every layout.

## Amendment (2026-10-16): start and stop through the Cloudflare exposure

Asked by the user, who opens the viewer through pantin-dev and could not
start the bridge (user statements, 2026-10-16). Cloudflare Access now
protects the exposure: on 2026-10-16 an unauthenticated request to `/` and
to `/api/pantins` was redirected (302) to the Access login, and nginx on the
LAN address answered 403 for the pantin-dev name.

- Point 4, **Exposure**, is lifted: `PUT .../bridge` no longer looks at
  `X-Pantin-Exposure`. Starting or stopping the bridge through the exposure
  is the same request as from the local viewer, with the same checks (listen
  address of this host, private allow list, ports, cap).
- Unchanged: the tag bus stays closed through the exposure, at nginx and in
  the core (ADR 0046 point 7), and Modbus is never proxied. The bridge
  listens on the address chosen in the request, never through the tunnel.
- Risk accepted: whoever passes the Access policy can open a Modbus slave on
  the LAN. The Access token is still not checked at the origin
  (docs/backlog/access-token-at-origin.md), so a misconfigured policy or
  tunnel would open this too. That item becomes a prerequisite of any
  exposure shared beyond the user.
- Rejected: keeping the refusal and reaching the viewer through an SSH
  tunnel or the core's `lan` mode. Both work, but the user wants one address.
