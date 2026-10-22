# 0065. An OPC UA client bridge in TypeScript

- Status: accepted (user, 2026-10-21)
- Date: 2026-10-21
- Source: spike 0013 (docs/spikes/0013-node-opcua.md), spike 0012 (NodeIds)
- Extends: ADR 0064 point 8 (chantier 2), ADR 0050 (supervision, status
  lines), ADR 0054 (bridge logs), ADR 0007, ADR 0046 (security, for OPC UA)
- Partly supersedes: ADR 0045 point 4 (`hello`, `plc_status`, one `plc`
  connection per Pantin), ADR 0050 points 1, 4 and 5 (one bridge per
  Pantin, the `.../bridge` routes, `BridgeStatus`), ADR 0054 points 2 and 4
  (`bridge.log`, `.../bridge/log`), ADR 0001 ("asyncua stays the candidate for OPC UA")
- Answers for OPC UA: ADR 0004 ("What this filter is not"), ADR 0046
  point 10
- Changes, with the user's consent of 2026-10-21 (CLAUDE.md 14.8):
  CLAUDE.md sections 4, 9, 10.2 and 13.7; io.json (a new kind, no version
  bump); tag bus version 2; a new package `@pantin/network-address`; new
  dependencies (node-opcua packages)

## Context

The user decided, before this ADR:

- Pantin is an OPC UA client of the PLC's server (CODESYS).
- The client is written in TypeScript and runs as a separate process
  spawned by the core. Both bridges may run at once for one Pantin.
- It speaks the tag bus and stays detached from the core's internals.

The user decided, on 2026-10-21, for this ADR:

- The PLC's address is chosen at each start and never saved (point 8).
- A new module defaults to SignAndEncrypt with Basic256Sha256 (point 2).
- A user password lives in the core's memory only (point 9).
- Consent to node-opcua (after spike 0013), to tag bus version 2 and the new
  bridge routes, to `@pantin/network-address`, and to the CLAUDE.md wording
  of point 16.

Repository facts (`develop`, ef76a2f):

- io.json version 2 is a union of transports on `kind`, with one channel
  sub-object per kind (`CHANNEL_KEY_BY_KIND`,
  `transport-types/src/schemas.ts`). `TransportRules.listenPort` already
  allows a transport that does not listen (`rule-types.ts`).
- The supervisor:
  - keeps one entry per Pantin and filters Modbus modules by kind
    (`modbusModulesOf`, `bridge-checks.ts`);
  - spawns `<python> -I -u -m pantin_bridge ...` (`bridge-output.ts`);
  - caps the core at 4 bridges (`MAX_SUPERVISED_BRIDGES`).
- The `ready` line is `{event, listen, modules: [{key, port}]}`;
  `BridgeStatus` has one `network` and `modules[].port`
  (`protocol/src/bridge.ts`).
- The bus:
  - accepts one `plc` connection per Pantin (`bus-hello.ts`);
  - compares the `hello` `mappingId` with a SHA-256 of the whole canonical
    io.json (`mappingIdOf`);
  - is at `TAG_BUS_VERSION = 1`, with `plc_status.reason` `closed`,
    `timeout` or null.
- The bridge log is `<logs dir>/<pantinId>/bridge.log`, served by
  `GET .../bridge/log` and read by the viewer and by `pantin bridge-log`.
- The core runs TypeScript directly (`node packages/core/src/main.ts`,
  Node >= 24). Address classification is pure, in
  `core/src/domain/network-address.ts`, with the shared fixture
  `address-cases.json`.
- `tests/` is not a workspace package (no `package.json`).
- The generated GVL has no name inside its text: the user names the GVL
  object when pasting it into CODESYS (`core/src/domain/gvl.ts`).

Spike 0013 measured, on node-opcua 2.186.17 and Node 24.21.0:

- MIT, pure JavaScript, ESM with shipped types, no install script, no native
  addon, no `openssl` binary (certificates created with an empty PATH).
  Very active; the npm package has one maintainer. Four advisories in 2026,
  all fixed below 2.186; `pnpm audit` clean.
- `node-opcua-client` is 127 packages and 33 MB. With `node-opcua-server`
  and the certificate manager, the development tree is 140 packages and
  76 MB. 5 small packages have no licence field. The client does not
  re-export the certificate manager, so `node-opcua-certificate-manager` is
  a direct dependency.
- The PKI layout is `own/`, `trusted/`, `rejected/`, `issuers/`. Without an
  explicit certificate manager, client and server write to
  `~/.config/node-opcua-default-nodejs`.
- An unknown server certificate fails with `BadCertificateUntrusted` and
  lands in `rejected/`, its file name carrying the SHA-1 thumbprint. Trust
  takes the certificate bytes (`trustCertificate(der)`), not a thumbprint.
- `endpointMustExist: false` connects to a fixed IP when the server
  advertises another host name.
- SignAndEncrypt worked with Basic256Sha256, Aes128_Sha256_RsaOaep and
  Aes256_Sha256_RsaPss. Sign was run only with Basic256Sha256.
  User/password worked. For anonymous access, only the refusal was
  observed; the success path was not run.
- Subscriptions, writes, `DataType`, `UserAccessLevel` and `NamespaceArray`
  reads worked. The built-in reconnection restored a subscription after a
  server restart. The client listens only with `ClientReverseConnect`
  (read in the source, not tested at socket level).
- The test server listens on every interface unless `host` is set, and
  starts in about 1.2 to 1.5 s.
- The library logs to stdout by default.
- asyncua is LGPL-3.0. No maintained open62541 binding exists on npm.
- CODESYS SP17 and later may require a device user by default (section 8).

NOT VERIFIED:

- **Toolchain:** strict `tsc` with `noUncheckedIndexedAccess` over
  node-opcua's types, and a possible clash with the pinned `@types/node`.
- **Licences** of the 5 packages without a licence field.
- **node-opcua internals:**
  - how to turn off its logging to stdout;
  - how to reach a session socket's `remoteAddress`;
  - the file modes it gives the private key;
  - two bridges sharing one PKI folder (its `mutex/`);
  - Int64 values against JavaScript numbers;
  - accepting a host name mismatch on a trusted certificate;
  - turning off its own reconnection (`connectionStrategy`);
  - `MaxNodesPerWrite` and the other operation limits.
- **Targets:** IPv6 literal targets (`opc.tcp://[fd00::1]:4840`).
- **CODESYS:**
  - the NodeId rule (spike 0012), and the device part, which may come from
    the runtime name rather than the XML `devicename`;
  - the namespace URI of `|var|` nodes, port 4840 (read in a search summary
    only), the minimum sampling interval, security and user defaults;
  - its endpoint host names;
  - whether it shows certificate thumbprints in SHA-1;
  - the status code it returns when it refuses a client certificate;
  - its behaviour on PLC restart, and the exchange period.

## Decision

1. **Package** `packages/opcua-bridge`, `@pantin/opcua-bridge`, private and
   never published.
   - `src/main.ts` run by `node`, strict TypeScript, vitest, part of
     `pnpm check`.
   - Imports:
     - `@pantin/protocol` and `@pantin/network-address`;
     - `node-opcua-client` and `node-opcua-certificate-manager`, exact pin
       2.186.17, in `src/opcua/session.ts` and `src/opcua/pki.ts` only (a
       dependency-cruiser rule, test files excepted);
     - `ws`, already pinned in the workspace.
     It never imports core, viewer or transport-types rules; it joins the
     isolated packages.
   - `node-opcua-server` 2.186.17 is a development dependency only.
     Versions are bumped by hand, with `pnpm audit` and a read of the
     release notes.
   - **stdout carries status lines only.**
     - node-opcua's own logging goes to stderr if S3 finds its switch.
     - The guaranteed fallback is installed before node-opcua is imported:
       `process.stdout.write` is wrapped. Only text from the bridge's
       `writeStatusLine`, which holds the original function, reaches
       stdout; everything else goes to `process.stderr.write`.
     - A test runs `console.log` and a node-opcua connection, and asserts
       that stdout holds only schema-valid status lines.
2. **Transport `opcua_client`** (`transport-types/src/opcua-client/`:
   schema, rules, labels, presentation), as named by ADR 0064 point 3. One
   module is one session to one PLC server.

   | Field | Type | Default |
   | --- | --- | --- |
   | `port` | 1 to 65535 | 4840 |
   | `endpointPath` | `""` or starting with `/`, at most 255 | `""` |
   | `securityMode` | `None`, `Sign`, `SignAndEncrypt` | `SignAndEncrypt` |
   | `securityPolicy` | `None`, `Basic256Sha256`, `Aes128_Sha256_RsaOaep`, `Aes256_Sha256_RsaPss` | `Basic256Sha256` |
   | `auth` | `{kind: "anonymous"}` or `{kind: "user", userName}` | anonymous |
   | `namespaceUri` | string, at most 255 | `""` |
   | `nodeIdPrefix` | string, at most 255 | `\|var\|CODESYS Control Win V3 x64.Application.` |
   | `gvlName` | an IEC identifier (ADR 0045 point 9) | `GVL_Pantin` |
   | `samplingMilliseconds` | 0 to 10 000 | 20 |
   | `publishingMilliseconds` | 10 to 60 000 | 20 |
   | `watchdogMilliseconds` | 100 to 3 600 000 | 1000 |

   - Security:
     - `securityMode` is `None` exactly when `securityPolicy` is `None`;
     - the deprecated `Basic128Rsa15` and `Basic256` are not offered.
   - No host and no password in io.json (points 8 and 9).
   - `namespaceUri`:
     - `POST .../io/modules` gives a new module `""`;
     - the rule `namespace_missing` keeps the mapping invalid until the user
       fills it in;
     - a URI the server does not know gives one ERROR line that lists the
       server's `NamespaceArray`, so the user can copy the right one.
   - The `nodeIdPrefix` default follows spike 0012 and is NOT VERIFIED; the
     guide tells the user to check it against the PLC.
   - Channel sub-object `opcua: { identifier: string | null, iecType }`:
     - `identifier` null means derived (point 3). A string is an explicit
       identifier (`s=...`, `i=...`) in `namespaceUri`, for other servers.
     - The namespace index is resolved at each session and never stored.
   - IEC to OPC UA data types. The default per signal type is in bold:

     | Signal | `iecType` | OPC UA DataType |
     | --- | --- | --- |
     | bit | **BOOL** | Boolean |
     | float | **REAL**, LREAL | Float, Double |
     | integer | INT, **DINT**, LINT | Int16, Int32, Int64 (NOT VERIFIED in JS) |

     Integers wrap like a hardware counter. Values stay SI (ADR 0045
     point 8).
   - Problem codes: `security_mismatch`, `namespace_missing`,
     `identifier_invalid`, `iec_type_mismatch`, `gvl_name_mismatch`
     (point 3). Every (type, direction) pair is carried.
   - Feedback is written on change, with no write-mode field. Each bus
     `tags` message becomes one Write of the module's changed feedback,
     split by the server's `MaxNodesPerWrite` when it declares one (NOT
     VERIFIED). A full write follows each session open and each `snapshot`.
     Cyclic rewrite goes to the backlog.
   - Commands:
     - one subscription per module, queue size 10, forwarded in order;
     - only changes against the PLC's last value go to the bus (ADR 0045
       point 10);
     - a pulse shorter than the sampling interval the server revised (it
       may clamp ours) can be lost, and the guide says so.
3. **Identifier derivation lives in the core.**
   - For a null `identifier`, the transport rules compute
     `s=` + `nodeIdPrefix` + `gvlName` + `.` + `variable` when `variable`
     has no dot (the GVL Pantin generates), and `s=` + `nodeIdPrefix` +
     `variable` when `variable` is dotted: it already names its GVL or POU
     (ADR 0064 point 9).
   - `IoMappingResponse` channels of `opcua_client` modules carry
     `opcua.resolvedIdentifier`, computed by the core. The viewer shows it,
     and the bridge uses it without deriving anything.
   - `pantin gvl` writes `gvlName` in its header ("paste into a GVL named
     …") for OPC UA modules.
   - An undotted variable mapped in two OPC UA modules must have the same
     `gvlName` in both, or the mapping gets the problem
     `gvl_name_mismatch`: one variable is declared once, in one GVL.
4. **The registry, not kind names, in the core** (closes the backlog's
   `modbusModulesOf` item).
   - `TransportRules` gains `network: "listens" | "connects"` and
     `bridgeModules(module)`, the facts the checks need.
   - Each transport's `schema.ts` exports its start request schema.
   - `main.ts` is the only place that pairs a kind with a program, as
     `BridgeLauncher { kind, command, args }` values.
5. **Spawning, supervision and the process contract.**
   - Host flag `--opcua-bridge <entry path>`, like `--bridge-python`:
     - the file is checked at start-up;
     - without the flag the kind is `unavailable`;
     - `pnpm serve` passes it, and tests read `PANTIN_OPCUA_BRIDGE`.
   - The command is an argument array with `shell: false`:

         <process.execPath> <entry> --status-lines --core <url> --pantin <id>
           --pki-dir <dir> --target <module>=<ip>... [--trust <sha256>]...

   - Environment: an explicit allowlist (`PATH`, `HOME`, `USERPROFILE`,
     `LANG`, `LC_ALL`, `TZ`, `TMPDIR`, `TEMP`, `TMP`, `SystemRoot`,
     `XDG_STATE_HOME`), nothing else, so no `NODE_OPTIONS`, `NODE_PATH`,
     `NODEOPCUA*` or proxy variable is inherited.
   - stdin is a pipe. With `--status-lines` only, the bridge reads one JSON
     line of passwords to EOF before anything else. A manual terminal run
     without `--status-lines` reads no stdin, so a `user` module there exits
     with `configuration`: "start it from the viewer".
   - The contract is the Python bridge's:
     - SIGTERM exits 0 with no `exiting` line;
     - `io_changed` exits `mapping_changed`, and a closed bus exits
       `bus_closed`;
     - a start needs at least one module of the kind (409 otherwise).
   - Supervisor entries are keyed by (Pantin, kind), one ADR 0050 state
     machine each. The cap of 4 processes per core counts every bridge.
     Port claims apply to `listens` kinds only.
   - `ready` line, discriminated on `transport`:
     - Modbus: `listen` and `modules: [{key, port}]`;
     - OPC UA: `modules: [{key, endpoint}]` and `clientCertificate:
       {subject, applicationUri, sha256, sha1}`. The core never reads the
       PKI.
     - It comes after configuration, the PKI and the bus `welcome`, without
       waiting for the PLC: a stopped PLC is a module state, not a start
       failure.
   - Reconnection is the bridge's own loop: 1 s backoff, doubling up to
     10 s, with node-opcua's own retries turned off (option NOT VERIFIED).
     One place owns the retries and the states. This is not the restart
     ADR 0050 point 3 forbids: the process stays.
6. **Watchdog and `plc_status`.**
   - The keep-alive count is `max(1, floor(watchdogMilliseconds / (3 ×
     revised publishing interval)))`, so that a healthy server answers at
     least 3 times per window. The lifetime count is 3 times the keep-alive
     count.
   - `watchdogMilliseconds` measures publish silence: the time since the
     last publish response of the module's subscription, data or
     keep-alive.
   - A module is `connected` when its session is open, its nodes are
     checked (point 11), its subscription exists and the first publish
     response has arrived.
   - Reasons:
     - `closed`: socket or session closed;
     - `timeout`: silence beyond the watchdog; the bridge closes the session
       and reconnects;
     - `node_mismatch`: point 11; the bridge closes the session itself and
       retries every 10 s;
     - `certificate_rejected`: the PLC refused Pantin's certificate
       (point 10).
   - In the core, zeroing (ADR 0045 point 11) covers that transport's
     modules only. A command is mapped once, so it has one owner.
7. **Routes, status, bus and logs.**
   - Bridge routes:
     - `GET .../bridges` answers `{bridges: BridgeStatus[]}`, one per kind
       of the registry;
     - `PUT .../bridges/:kind` takes that kind's start request (Modbus:
       `{running, listen, allow}`; OPC UA: `{running, targets, passwords?,
       trust?}`);
     - `.../bridge` is removed without deprecation (0.2).
   - `BridgeStatus` gains `transport`; `network` becomes the kind's start
     settings, without passwords; `modules[]` becomes `{key, endpoint,
     plcConnected, reason}`; OPC UA adds `clientCertificate`.
   - The SSE `bridge` event carries the list.
   - `BridgeFailure` and the `exiting` line gain `certificate: {subject,
     notBefore, notAfter, sha256, sha1, reason}` or null, and `module` or
     null. The status-line fixtures cover every new shape.
   - New exit kinds: `untrusted_server_certificate`,
     `server_certificate_invalid`, `authentication_failed`.
   - Projection and `mappingId`:
     - `GET .../io?transport=<kind>` answers the projection;
     - the projection's problems are the problems of that kind's modules
       and channels, plus the common problems that touch them
       (`unknown_tag`, `command_mapped_twice`, `duplicate_variable` on their
       channels, and whole-file problems such as `invalid_json`). Its status
       is `valid` when that list is empty. A problem in another kind's
       module never reaches it;
     - its `mappingId` is the SHA-256 of that status and problems, the
       canonical modules of the kind, and the type and direction of their
       tags;
     - the start check of ADR 0050 point 4 reads the projection's status,
       so an OPC UA module still missing its `namespaceUri` does not block
       a Modbus start;
     - an OPC UA edit no longer restarts the Modbus bridge;
     - the unfiltered route keeps today's id;
     - S1 tests that an invalid OPC UA module leaves the Modbus projection's
       id and status unchanged.
   - Bus version 2:
     - a `plc` `hello` carries `transport` and the projection's id;
     - one `plc` connection per (Pantin, transport);
     - `io_changed` goes only to the connections whose projection changed;
     - `plc_status.reason` gains `node_mismatch` and `certificate_rejected`.
   - The Python bridge moves to version 2 with `transport:
     "modbus_tcp_slave"` and reads its projection. The fixtures are
     regenerated (ADR 0045 point 2).
   - Logs (ADR 0054):
     - one file per kind, `<logs dir>/<pantinId>/bridge-<kind>.log`. An old
       `bridge.log` is left as it is, never migrated (0.2);
     - `GET .../bridges/:kind/log` replaces `.../bridge/log`;
     - `pnpm pantin bridge-log <pantin> [--transport <kind>]`.
       `--transport` is required when files of more than one kind exist,
       and the error lists them.
8. **Network rules for outgoing connections** (ADR 0004, ADR 0046).
   - The target is a machine setting, given per module at each start. It is
     never on disk, kept in memory for Restart, and 127.0.0.1 by default.
     The client writes into PLC variables, so a shared Pantin folder must
     never aim at another network's PLC.
   - `local` means 127.0.0.1 or ::1 only (ADR 0004 point 1). `lan` means
     one explicit private address per module (RFC 1918, fc00::/7).
   - Refused by the core with 400, and again by the bridge:
     - host names, `localhost` included (DNS can rebind to anything);
     - 0.0.0.0 and ::;
     - loopback addresses other than the two above;
     - public, link-local, multicast and broadcast addresses;
     - 100.64.0.0/10;
     - IPv4-mapped forms, after normalisation.
   - The bridge connects only to the target and port
     (`endpointMustExist: false`). It ignores the hosts of the endpoint URLs
     the server returns, never uses reverse connect and opens no listening
     socket.
   - After connect, `remoteAddress` is classified again (access NOT
     VERIFIED). A mismatch closes the session.
   - `lan` needs no allow list: the target is one explicit address.
   - Security combinations:
     - `None` toward a `lan` target is allowed, with the console warning
       `opcua_unsecured_lan` (no worse than Modbus, ADR 0046 point 10);
     - `user` with `None` toward `lan` is refused, since the password would
       travel in clear.
   - **Through the Cloudflare exposure** (`X-Pantin-Exposure` present):
     - `PUT .../bridges/opcua_client` answers 403 for any `lan` target, any
       `passwords` and any `trust`;
     - the message: "Through the remote exposure Pantin connects only to a
       PLC on this host (127.0.0.1 or ::1), without passwords or
       certificate trust. Open the viewer on the host for these.";
     - only loopback targets pass, with passwords already stored;
     - relaxing this needs a new user decision. The Modbus amendment of
       ADR 0050 (2026-10-16) is unchanged.
   - ADR 0046 point 10 still holds: a PLC under test never drives live
     outputs at the same time. An explicit identifier can write any writable
     node of the server, so the target must be a PLC under test. The guide
     and the `pantin gvl` header say both.
9. **Credentials** (start request).
   - `targets` must match the kind's modules exactly. An unknown or missing
     key is a 400 that names it.
   - Passwords live in memory only, per (Pantin, module), and are cleared
     at core stop:
     - an omitted password keeps the stored one;
     - `user` with none stored is a 400;
     - `authentication_failed` forgets that module's password.
   - Passwords never appear in io.json, a log, the console, `BridgeStatus`,
     SSE, the command line (visible in `ps`) or a 400 message. Tests send a
     marker password and assert that it appears nowhere.
   - The viewer asks for them at Start, in a password field.
10. **Certificates.**
    - The PKI is host-wide: `--opcua-pki-dir`, by default
      `$XDG_STATE_HOME/pantin/opcua-pki` (`~/.local/state/pantin/opcua-pki`).
      - The core refuses at start-up a PKI folder inside the Pantins folder,
        compared after `realpath`.
      - The bridge always passes explicit certificate managers, so nothing
        is written to `~/.config/node-opcua-default-nodejs`.
      - The bridge sets the folder to 0700 and the key to 0600, refuses to
        start if it cannot, and is tested for both.
      - Two bridges share it through node-opcua's `mutex/` (NOT VERIFIED;
        S3 tests two concurrent starts).
      - Trust is therefore host-wide, which the guide says.
      - The Windows path is NOT VERIFIED.
    - Pantin's certificate is created at the first start, with the URI
      `urn:pantin:<hostname>:opcua-bridge`. Its SHA-256 and SHA-1 are
      shown, since CODESYS may show SHA-1 (NOT VERIFIED).
    - **An unknown server certificate** goes to `rejected/`, and the whole
      bridge exits `untrusted_server_certificate` with the first such
      certificate: one flow, one restart. A second unknown certificate shows
      at the next start.
      - The viewer offers "Trust and restart", which sends `trust:
        [<sha256>]`.
      - The bridge hashes the certificates in `rejected/` itself (SHA-256 of
        the DER) and calls `trustCertificate` only for the one whose hash
        matches exactly.
      - No silent trust on first use.
    - **Other server certificate errors** (expired, not yet valid, an
      application URI mismatch) exit `server_certificate_invalid` with the
      reason. `trust` never overrides them. A host name mismatch on a
      certificate trusted by thumbprint is accepted with a WARNING, since
      identity comes from the pinned thumbprint and targets are IP literals
      (NOT VERIFIED that node-opcua allows it).
    - **The PLC refuses Pantin's certificate**: the module gets
      `certificate_rejected` and is retried every 10 s, so trusting it in
      CODESYS is enough, with no restart. The message: "The PLC refused
      Pantin's certificate (SHA-1 …, SHA-256 …). Trust it in the PLC's OPC UA
      security settings; Pantin retries every 10 s."
    - With `None`, no certificate is exchanged.
11. **Node checks at each session.**
    - The bridge reads `DataType` and `UserAccessLevel` of every node: a
      command needs CurrentRead, a feedback needs CurrentWrite, and the type
      must match the table of point 2.
    - Any missing or mismatched node gives `node_mismatch`, with one ERROR
      line per distinct problem.
12. **Symbol import** (ADR 0064 points 10 to 13).
    - The OPC UA `symbolWarnings` require `read` for commands and `write`
      for feedback, and warn on an IEC type that differs from `iecType`.
    - `SymbolImportPreview` gains `moduleProposals: [{module, nodeIdPrefix,
      reason}]`:
      - the prefix is `|var|<devicename>.<application>.`, built from
        `ProjectInfo`;
      - it is marked "to check": the NodeId may use the runtime name, not
        `devicename` (spike 0012), so it is probably wrong on a renamed
        runtime;
      - the user applies it through `PATCH .../io/modules/:key` with
        `transport.nodeIdPrefix`, a separate request from
        `POST .../io/variables`.
13. **Viewer.**
    - The module heading reads, for example, "Client OPC UA · port 4840 ·
      Signer et chiffrer · Basic256Sha256 · anonyme".
    - OPC UA columns: the resolved node, with the word "dérivé" or
      "explicite", and the IEC type.
    - Each kind has one connection card. The OPC UA card has a target per
      module, a password field for `user` modules, Pantin's thumbprints, the
      trust prompt and the per-module reason, in words.
    - Colour is never the only cue. French and English labels. The viewer
      computes nothing.
    - Anonymous stays the default. The guide says that CODESYS SP17 and
      later may require a device user (spike 0013 section 8).
14. **Testing.**
    - transport-types: the schema, the security pair, `namespace_missing`,
      derivation (undotted and dotted), the type table, the registry test.
    - core:
      - the projection and its id, `io_changed` per transport, one `plc`
        connection per transport, zeroing per transport;
      - every refused target class, and `local` limited to 127.0.0.1 and
        ::1;
      - the exposure 403s;
      - exact `targets` matching and the password rules of point 9;
      - the launcher arguments and the environment allowlist;
      - the PKI folder refused inside the Pantins folder;
      - log routes per kind.
    - opcua-bridge, against an in-process `OPCUAServer` with
      `host: "127.0.0.1"`, port 0 and temporary PKI folders, publishing
      `|var|`-style string nodes in a custom namespace (the reference, as
      pymodbus is for Modbus, ADR 0048 point 5). Cases:
      - subscriptions and Write, including a short pulse;
      - None, Sign and SignAndEncrypt (Basic256Sha256), anonymous accepted
        and refused, user accepted and refused;
      - the untrusted certificate, then `--trust`, and an expired
        certificate;
      - the client certificate refused by the server;
      - `node_mismatch` and the `NamespaceArray` line;
      - the watchdog, by pausing the server's publishing;
      - reconnection after a server restart;
      - stdout carrying status lines only (point 1);
      - PKI modes and two concurrent bridges on one PKI;
      - no listening socket: on Linux, the child's socket inodes against the
        LISTEN entries of `/proc/net/tcp` and `tcp6`;
      - the node-opcua import rule.
    - Closed loop, in `pnpm check`: a new private workspace package
      `tests/closed-loop/` (`@pantin/closed-loop-tests`, with
      `node-opcua-server` as a development dependency), listed in
      `pnpm-workspace.yaml`. The viewer colour tests already in `tests/`
      stay where they are and run as today. It is test code only and
      imports protocol at most, never core or a bridge; a
      dependency-cruiser rule enforces it, part of the S4 exit criteria.
      - It spawns the core, both bridges and an in-process server on a copy
        of plc-cylinder, with one Modbus module and one OPC UA module and a
        feedback in both.
      - It reads the Modbus side with a raw-socket client in its test
        support; the bridge's Modbus conformance stays tested against
        pymodbus.
    - Stage 2, a real CODESYS server: a manual demonstration by the user,
      pending, as ADR 0045 P6 was.
15. **Slices**, in order S1, S2, S3, S4; S5 after S2. Each one leaves develop
    green and is reviewed before it merges.
    - S1: the transport folder, derivation, projection and id, bus version
      2, and the Python bridge on version 2.
    - S2:
      - `@pantin/network-address`;
      - core launchers, supervisor per kind, new routes and status, log
        files per kind and the CLI;
      - the minimal viewer change: the Modbus card on `.../bridges` and the
        new status.
    - S3: `opcua-bridge` with its dependencies and tests.
    - S4: the `tests/closed-loop/` package and the closed loop.
    - S5: the full viewer (OPC UA card, columns, import proposals).
    - S6: doc-writer (guide "Connecter un automate en OPC UA"), CLAUDE.md,
      CHANGELOG. S7: the CODESYS demonstration by the user.
16. **CLAUDE.md wording.**
    - Section 4, packages:
      - "packages/opcua-bridge pont client OPC UA (TypeScript, node-opcua,
        processus séparé lancé par le coeur à la demande, ADR 0065)";
      - "packages/network-address classement d'adresses, pur (ADR 0065)";
      - "tests/closed-loop  test en boucle fermée des deux ponts (ADR 0065)".
    - Section 4, rule: "core, viewer, bridge et opcua-bridge ne s'importent
      jamais entre eux ; core et opcua-bridge importent network-address ;
      opcua-bridge importe protocol".
    - Section 4, stack item 3: "asyncua pour OPC UA plus tard" becomes "le
      client OPC UA est un second pont, en TypeScript (node-opcua,
      ADR 0065)".
    - Section 9: "les deux ponts l'utilisent ; le hello nomme son
      transport".
    - Section 10.2: "OPC UA ensuite, en client du serveur de l'automate
      (ADR 0065)".
    - Section 13.7: "(OPC UA repoussé, ADR 0045, 0049)" becomes "(OPC UA
      client : ADR 0065)".
    - The package lines and the dependency rule enter CLAUDE.md with the
      slice that creates each package: network-address in S2, opcua-bridge
      in S3, tests/closed-loop in S4. Each of those slices has that
      CLAUDE.md line in its exit criteria.

## Rejected alternatives

- **asyncua in the Python bridge**: one process with two protocols, so a
  fault in one stops both. Its licence is LGPL-3.0 (spike 0013). The user
  chose TypeScript.
- **Pantin as an OPC UA server**: the PLC program would have to act as a
  client, unlike on the machine (ADR 0003). CODESYS is already a server.
- **A client inside the core**: PLC network I/O inside the loop (CLAUDE.md
  3.1, ADR 0007).
- **A hand-written OPC UA client**: secure channels, sessions and
  cryptography are too large to own (unlike ADR 0048).
- **An open62541 binding**: none maintained on npm, and it would be a native
  addon (spike 0013).
- **The endpoint host in io.json**: a shared folder would aim writes at
  another network's PLC. Rejected by the user.
- **Silent trust on first use**: a spoofed first contact would be trusted
  forever.
- **Passwords in io.json, in a nearby file or in an environment variable**:
  committed by mistake, or inherited by every child. Rejected by the user in
  favour of memory only.
- **Stored namespace index**: it depends on the server (spike 0012).
- **Browse paths resolved at connect**: the CODESYS address space layout is
  NOT VERIFIED.
- **Derivation in the bridge**: it would need the transport rules, against
  the import rule.
- **`lan` targets, passwords or trust through the exposure**: the Access
  token is not checked at the origin
  (`docs/backlog/access-token-at-origin.md`).
- **node-opcua's own retry loop**: two owners of the connection state.
- **Copying `network-address.ts` into the bridge**: two TypeScript copies of
  one rule.
- **Renaming `packages/bridge` now**: unrelated to the decision; backlog.

## Consequences

- Up to two supervised processes per Pantin, still 4 per core.
- Breaking at 0.2: bus version 2, the `.../bridges` routes, the log file
  names. The Python bridge, the core, the CLI and the viewer move together
  in S1 and S2.
- io.json gains a kind without a version bump. A version 2 file without OPC
  UA modules is unchanged.
- node-opcua 2.186.17, exact pins: about 33 MB at run time and 76 MB in
  development. The npm package has one maintainer, a bus-factor risk
  accepted for a simulator and noted for the next review. 5 packages have
  no licence field.
- Amendment lines, appended only, when this ADR is accepted:
  - ADR 0001: asyncua superseded;
  - ADR 0007: "Extended by: ADR 0065";
  - ADR 0045, ADR 0050 and ADR 0054: "Partly superseded by: ADR 0065";
  - ADR 0046: "Extended by: ADR 0065";
  - ADR 0064: "point 8 built by: ADR 0065";
  - `docs/backlog/opc-ua.md` closed.
- Backlog: cyclic writes, an address space browser, arrays and structures
  as one node, methods and events, a GDS, reverse connect, server mode,
  Windows paths and environment, renaming `packages/bridge`, and relaxing
  the exposure rules (a new user decision).
- NOT VERIFIED: every item of the Context list.

## Amendment of 2026-10-21, S1

Written when slice S1 was built. These are the settled readings of the points above, so that
S2 to S5 rely on them. They add detail and contradict no decision.

- **Point 4, `bridgeModules`:** the hook is `bridgeModules(modules)`. It takes every module of
  the mapping and returns `{key, port}` for those of its own kind, with `port` null for a
  transport that connects out.
- **Point 3, `gvl_name_mismatch`:** it compares several modules, so a transport's own
  `validateModule` cannot raise it. The rules expose `variableScope(transport)` (the GVL name
  for OPC UA, null for Modbus) and the core makes the check. It reports one problem per
  module, at `modules[i].transport.gvlName`, and compares names without case. The schema
  checks `gvlName` against the IEC identifier pattern; the reserved-word list stays in the
  core and is not applied to it.
- **Point 7, projections:**
  - The `unmappedTags` of a projection are the document's tags that none of the kind's
    channels maps.
  - The problem paths of a projection index its own `modules` array.
- **Point 7, `io_changed`:** a `plc` connection receives it only when its projection's id
  changed. A `client` connection keeps following the whole file: the unfiltered id and the tag
  list.
- **Point 2, IEC types:** the default integer type is DINT. The list is DINT, INT, LINT.
- **`plc_status` and symbol access (not in the slice list):**
  - A `plc_status` for a module that is not in the connection's projection is ignored. The
    bridge gets an `error` message, and the module is never marked connected.
  - `symbolWarnings(channel, symbol, signal)` receives the signal's direction. For OPC UA a
    command needs a readable variable and a feedback a writable one; Modbus ignores the access.
- **Deferred to S2:** the supervisor is still per Pantin and Modbus. `bridgeConnected` (the
  "external bridge" fact) means any transport's bridge, held with a set of connected
  transports. S2 makes it per kind with the supervisor.

## Amendment of 2026-10-21, S2

Written when slice S2 was built (sub-slices S2a network-address, S2b supervisor, routes and
logs, S2c the core side of an OPC UA start, S2d the viewer). Settled readings, adding detail
and contradicting no decision.

- **Point 7, `BridgeStatus`:** a union on `transport`. Common fields: `availability`,
  `state`, `modules: [{key, endpoint, plcConnected, reason}]`, `failure`, `log`,
  `externalBridgeConnected`. Modbus adds `network: {listen, allow} | null` and
  `listenChoices`; OPC UA adds `network: {targets} | null` and has no `listenChoices`.
  `GET .../bridges` lists the kinds in `TRANSPORT_KINDS` order. An unknown `:kind` is a 404
  that lists the known kinds.
- **Endpoints:** Modbus `<listen>:<port>`, OPC UA `opc.tcp://<target>:<port><endpointPath>`,
  IPv6 in brackets. The status endpoints come from the bridge's `ready` line.
- **Point 4, kind names in the core:** besides `main.ts` (launchers), the status and start
  plan files (`domain/bridge-kinds.ts`, `domain/bridge-status.ts`) name kinds, since each
  kind's start request and status part differ. The checks themselves read
  `TransportRules.network` and `bridgeModules`.
- **Console and log lines:** core lines carry a transport or null; null goes to the log of
  every active kind of the Pantin.
- **Point 7, CLI:** `bridge-log` without any file and without `--transport` is an error, even
  with `--follow`; following a file not yet written needs `--transport`.
- **Point 8, scope:** it follows the address. A loopback address is `local` (127.0.0.1 and
  ::1 only), anything else is `lan`. Through the exposure only exactly 127.0.0.1 and ::1
  pass; any other target, malformed ones included, gets the 403.
- **Check order** of an OPC UA start: exposure (403), mapping (409), target keys (400),
  addresses (400), security (a `user` login with `None` toward a lan target, 400), passwords
  (400), the `plc` slot, the cap.
- **Point 7, `clientCertificate`:** the OPC UA `BridgeStatus` carries
  `clientCertificate: {subject, applicationUri, sha256, sha1} | null`, read from the `ready`
  line. It is null until a bridge of this core's run was ready once, then it stays after a
  stop or a failure (and across a restart): the user needs the thumbprints to trust Pantin in
  the PLC, most of all after a refused connection. The Modbus status has no such field.
- **Point 9, password bound to target:** a stored password is kept only while its module's
  target is the one it was given with (compared as typed in the request). A start with
  another target and no new password for that module forgets the stored one, also when the
  start is then refused, so a `user` module gets the 400 "needs a password" and the old
  password never reaches the new target's stdin.
- **Normalised addresses:** an accepted target is passed in the canonical uncompressed form
  of `@pantin/network-address` (`::1` becomes `0:0:0:0:0:0:0:1`). The bridge must accept it.
- **Point 5, stdin:** the password line is written at every OPC UA start, `{"passwords":{}}`
  when no module logs in. A relative `XDG_STATE_HOME` is ignored for the PKI default.
- **Point 5, environment:** the allowlist applies to the OPC UA child. The Python child still
  inherits the core's environment, as before this ADR.
- **Left for S3:** `pnpm serve` passes `--opcua-bridge` once the entry exists;
  `PANTIN_OPCUA_BRIDGE` is not read yet; `opcua-bridge` joins `NETWORK_ADDRESS_USERS` in
  `.dependency-cruiser.cjs`.
- **NOT VERIFIED:** the stdin write-error path; the PKI "inside the Pantins folder" check on
  Windows.

## Amendment of 2026-10-22, S3

Written when slice S3 was built (S3a the package, S3b sessions, S3c reconnection and
certificates). Settled readings, adding detail and contradicting no decision; the NOT
VERIFIED items they answer were measured against node-opcua 2.186.17 and its in-process
server, not against CODESYS.

- **Point 1, import rule:** node-opcua is confined to the folder
  `packages/opcua-bridge/src/opcua/`, not to two files (rule
  `node-opcua-only-in-the-opcua-folder`). `main.ts` installs the stdout guard and then loads
  the rest with a dynamic import, which a dependency-cruiser rule enforces. node-opcua logs
  through `node-opcua-debug`; the bridge redirects its debug, warning and error loggers to
  stderr, and the guard catches the rest.
- **Point 1, toolchain:** strict `tsc` with `noUncheckedIndexedAccess` passes with the
  repository's `skipLibCheck: true`; without it, node-opcua's `@peculiar` typings need the DOM
  library.
- **Point 5, stdin:** the password line has a schema, `BridgeStdinLineSchema` in protocol,
  used by both sides.
- **Point 5, reconnection:** node-opcua's own retries are off with `connectionStrategy:
  {maxRetry: 0}`. The bridge retries per module: 1 s doubling to 10 s after `closed` or
  `timeout`, reset once connected; every 10 s after `node_mismatch` or
  `certificate_rejected`. The last command values are cleared at each attempt, so that the
  commands the core zeroed are forwarded again.
- **Point 8, `remoteAddress`:** unreachable (private fields of node-opcua). The bridge watches
  Node's `net.client.socket` diagnostics channel once sessions start: a client socket not
  going to a module's exact address and port is destroyed and logged.
- **Points 2 and 6:** `MaxNodesPerWrite` and `MaxNodesPerRead` are read from the server's
  operation limits and writes and reads are split by them. Int64 values beyond 2^53 lose
  their low bits (tags are JavaScript numbers); INT, DINT and LINT wrap. The watchdog starts
  once monitoring is set up, after the subscription's revised settings are applied, and is fed
  by every publish response. The monitored items are created before that and each item's
  status is checked: an item the server refuses is `node_mismatch`, with one ERROR line naming
  the node, and the module is never `connected` (point 6).
- **Point 8, second line of defence:** the bridge itself refuses at start (exit
  `configuration`) a user login with security None toward an address that is not loopback, as
  the core does.
- **Point 9:** a refused user login, a refused anonymous login and a None endpoint without a
  user name policy all exit `authentication_failed` with `module` set.
- **Point 10:**
  - node-opcua checks neither the host name nor the application URI. A host name mismatch
    is a WARNING; the bridge checks the application URI itself against the server's announced
    one and exits `server_certificate_invalid` on a mismatch. A certificate without a URI in
    its subject alternative names passes this check: there is nothing to compare.
  - Text that comes from the PLC's certificate (subject, reason, quoted URIs) is cut to 256
    characters, with an ellipsis marker, so that an `exiting` line never passes 4096 bytes; the
    encoder also drops the certificate's text, then the certificate, if the line still does
    not fit.
  - Expired and not yet valid certificates both arrive as `BadCertificateTimeInvalid` and do
    not land in `rejected/`; the bridge fetches the certificate by discovery to name the
    reason.
  - `rejected/` holds PEM files named by SHA-1; the bridge hashes the DER.
  - The PLC refusing Pantin's certificate arrives as `BadSecurityChecksFailed` (or
    `BadCertificateUntrusted`), mapped to `certificate_rejected`. NOT VERIFIED on CODESYS.
  - node-opcua's `mutex/` does not cover creating a missing certificate: two concurrent
    starts could create two. The bridge writes a candidate file and publishes it with a hard
    link; the loser reads the winner's file.
- **Point 14:** no listening socket is checked on Linux through `/proc`. `PANTIN_OPCUA_BRIDGE`
  is set by `pnpm test` and read by the closed loop of S4.

## Amendment of 2026-10-22, S4

Written when slice S4 was built. Settled readings, adding detail and contradicting no decision;
the items marked NOT VERIFIED were not measured.

- **Point 14, the package:** `tests/closed-loop/` holds the test file and a `support/` folder
  (core process, HTTP API client, PLC server, raw Modbus client, the Pantin copy). The root
  `vitest.config.ts` already matched `tests/**/*.test.ts`, so `pnpm test` runs it with the
  viewer colour tests. The `tests/` TypeScript project excludes the folder, which has its own.
  A dependency-cruiser rule (`closed-loop-tests-import-only-protocol`) keeps it to protocol;
  `plc-server.ts` is the one file outside the bridge allowed to import node-opcua.
- **How io is prepared:** the test copies `examples/plc-cylinder` into a temporary Pantins
  folder and writes its `io.json` before the core starts, since the OPC UA port is only known
  once the server listens. The core is then driven through its HTTP API alone. Modbus carries
  the two switches and the position as feedback; OPC UA carries both commands and the extended
  switch and the position, so a feedback is mapped in both modules (a tag is mapped once per
  module, a command once overall). The variables are named differently per module (a variable
  is unique across modules).
- **How trust is done:** the test exercises the real flow, on both sides.
  1. The first OPC UA start fails with `untrusted_server_certificate`: the server's certificate
     is unknown to Pantin.
  2. The restart passes the failure's `certificate.sha256` as `trust`. The test server now
     rejects Pantin's certificate, and the module reports `certificate_rejected` (read through
     `GET .../bridges`).
  3. The test plays the operator: it takes the rejected certificate whose sha256 matches the
     status's `clientCertificate`, and trusts it on the server (`trustCertificate`).
  4. The bridge retries by itself and the module connects.

  The server has its own PKI in a temporary folder (`serverCertificateManager` with
  `rootFolder` and `automaticallyAcceptUnknownCertificate: false`, and a second one for
  `userCertificateManager`), so a run writes nothing to the user's configuration directory.
  This needs `node-opcua-certificate-manager` 2.186.17 (same pin as opcua-bridge), added as a
  devDependency of the test package with the user's approval of 2026-10-22. The security is
  `SignAndEncrypt` with Basic256Sha256.
- **Modbus connected:** a raw client counts as a PLC from its first request, as in
  `bridge-real.test.ts`.
- **Runtime and skips:** about 20 s for the file, of which about 10 s is the wait for the retry after
  `certificate_rejected`: the interval (ADR point 10) is not configurable in the bridge, and
  no test-only knob was added. Waits are polls to a deadline or server
  events. The describe is skipped, with the reason in its title only then, when `PANTIN_BRIDGE_PYTHON` or
  `PANTIN_OPCUA_BRIDGE` is missing. Each child is stopped in `afterAll`: the only direct
  child is the core: SIGTERM, which makes it stop its bridges, then SIGKILL after 10 s. If the
  core had to be killed, its bridges could be orphaned (NOT VERIFIED).
- **NOT VERIFIED:** Windows (the paths, SIGTERM); CODESYS itself, which stays the manual
  stage 2.

## Amendment of 2026-10-22, S5

Written when slice S5 was built (S5a core and protocol, S5b viewer). Settled readings, adding
detail and contradicting no decision.

- **Point 12, `moduleProposals`:** each entry is `{module, nodeIdPrefix, reason}`, with `reason`
  an enum the viewer translates, today only `from_project_info`. The core proposes nothing
  without project info, with an empty device or application name, for a prefix over 255
  characters, or when the module already has that prefix. Modbus modules never get one.
- **Point 13, security:** the viewer offers the security mode and the policy as two
  independent choices and never pairs them; a mismatch shows as the core's problem.
- **Point 13, the card:** the OPC UA card is hidden while the Pantin has no OPC UA module and
  its bridge is stopped. The Modbus card is titled with its transport. Targets are kept in the
  viewer's memory for the session and refilled from `network.targets`; passwords live only in
  the card's inputs and are cleared once a start request leaves, refused or not.
- **Closing a Pantin** with "stop the bridge" stops every running bridge of the Pantin.
- **Left for later:** the bridge log window is still Modbus only (OPC UA shows its log in the
  failure block); the explicit NodeId is not editable in the table; the forced tags warning is
  not on the OPC UA card; `certificate.reason` is the bridge's own English text; the CLI import
  preview does not print the proposals. No screenshot shows the OPC UA card (S6).
