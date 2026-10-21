# Spike 0013: node-opcua for an OPC UA client bridge in TypeScript

Date: 2026-10-21
Status: library verified by measurement against its own in-process server; nothing verified against a real CODESYS server

## Question

Can Pantin use node-opcua (client side) for a TypeScript OPC UA bridge, a separate Node
process spawned by the core, that talks to a CODESYS Control Win V3 OPC UA server, with
node-opcua's own server as an in-process test double (dev dependency only)? Node >= 24
(root `package.json` `engines`: `>=24`, measured here on Node v24.21.0, pnpm 12.6.0).

## Verdict

1. node-opcua fits. MIT, one maintainer company (Sterfive), very active, pure JavaScript
   (no native addon, no install script), ESM with shipped types, no `openssl` binary needed.
2. Pin `node-opcua-client` `2.186.17` (2026-10-05, 16 days old on 2026-10-21) for the bridge
   and `node-opcua-server` `2.186.17` for the tests, plus `node-opcua-certificate-manager`
   `2.186.17` as an explicit direct dependency (the client package does not re-export the
   certificate manager class, see section 3).
3. Three traps found by measurement: the test server listens on every interface unless
   `host` is set; both client and server write to a global folder in the home directory
   unless a certificate manager is given; trusting a server certificate needs the certificate
   bytes, not only a thumbprint.
4. Everything about the real CODESYS server (NodeIds, namespace, security defaults,
   certificate handling) stays NOT VERIFIED until a real server is tried.

## Method

- Registry data: `npm view` (versions, dates, licences, maintainers, dependencies).
- GitHub REST API (unauthenticated) for the repository: licence, commits, releases,
  security advisories. LICENSE read from the raw file.
- Throwaway installs with pnpm in a directory outside the repository (deleted at the end),
  versions pinned exactly. Note: `/tmp` was a full tmpfs (12 GB, 100 %, other users of the
  machine), so the throwaway directory was under `/home/tunnel/.cache/` instead of
  `/tmp/claude-1000/`. The default global PKI folder that the runs created in
  `~/.config/node-opcua-default-nodejs` was deleted too.
- Four prototype scripts (not kept, they were in the throwaway directory): an in-process
  server on 127.0.0.1 and a client in the same process, run with `PATH` emptied so that no
  `openssl` binary could be found.
- Nothing was installed in the repository, `git status` is clean.

## Results

### 1. Version, licence, maintenance, advisories

Verified:

- Latest stable on npm `latest` tag: `node-opcua` 2.187.10 (2026-10-19). `node-opcua-client`
  and `node-opcua-server` published 2.187.11 on 2026-10-21 (search listing). Dist-tags of
  `node-opcua`: `latest`, `patch` (2.113.2), `v2.67` (2.67.1). No pre-release tag in use.
- Release cadence is high and bursty: 453 versions since 0.0.1 (2014-01-22); since 2025-11:
  1, 1, 2, 3, 6, 2, 4, 1, 5, 4 releases per month, then 28 in 2026-09 and 14 in
  2026-10 (first 19 days). Releases are patch bumps of a monorepo (all `node-opcua-*` at the
  same number). The pin therefore should be bumped deliberately, not tracked.
- Licence: MIT. `LICENSE` of the repo (raw file, master): "The MIT License (MIT)
  Copyright (c) 2022-2024 Sterfive SAS ... Copyright (c) 2014-2022 Etienne Rossignon".
  GitHub reports SPDX MIT. `npm view` licence of `node-opcua-client@2.186.17` and
  `node-opcua-server@2.186.17`: MIT. Licence fields of all 140 installed packages
  (client and server): MIT 678 file entries, 0BSD 22, BSD-3-Clause 16, Apache-2.0 4,
  Unlicense 3 (`tweetnacl`), ISC 2, and 5 entries with no licence field (`dequeue`, `precond`,
  old small helper packages: NOT VERIFIED, their repositories were not read). The client
  tree alone was not separately audited for the licence of these five.
- Maintainer: `erossignon <etienne.rossignon@sterfive.com>` is the only npm maintainer of
  the node-opcua packages (bus factor: one person, backed by the company Sterfive). GitHub
  contributors: erossignon 6076 commits, next contributors 12, 10, 9. Not archived,
  1666 stars, 20 open issues, last push 2026-10-21.
- Commits since 2025-10-21: about 1617 (page count of the commits API, per_page=1).
- Security advisories (GitHub repo, 4 published, all fixed before 2.170):
  - GHSA-mq36-523m-x7vv / CVE-2026-54155, high: missing nonce verification in
    UserNameIdentityToken authentication, fixed 2.166.0.
  - GHSA-6wvw-vrw4-363w / CVE-2026-54156, high: unbounded nonce cache, unauthenticated heap
    exhaustion, fixed 2.166.0.
  - GHSA-r2pf-9cw4-5j65 / CVE-2026-68904, high: TCP socket leak (FIN-WAIT-2) during
    keepalive reconnection with a clock-skewed server, `node-opcua-client` and
    `node-opcua-transport` < 2.170.0.
  - GHSA-cv5q-7543-48q4 / CVE-2026-69200, low: prototype pollution in
    `node-opcua-client@2.144.0` (and two others), fixed 2.145.0.
  - Source: https://github.com/node-opcua/node-opcua/security/advisories (API
    `/repos/node-opcua/node-opcua/security-advisories`). `node-opcua-pki` and
    `node-opcua-crypto` repos list none.
  - Pinned 2.186.17 is above all fixed versions. `pnpm audit` on the install (both packages
    plus certificate manager, 140 packages): "No known vulnerabilities found", 2026-10-21.
  - The third advisory matters for us: a PLC with a skewed clock plus keepalive
    reconnection was a real failure mode, fixed in 2.170 (the reconnection test below ran
    fine on 2.186.17, but with no clock skew).

### 2. Split packages, size, dependencies

Measured with `pnpm add --save-exact` of `2.186.17` into empty directories, one store.

| Install | Packages in `node_modules/.pnpm` | Size on disk |
| --- | --- | --- |
| `node-opcua-client` only | 127 | 33 MB |
| `node-opcua-server` only | 140 | 74 MB |
| client + server + certificate-manager | 140 (shared) | 76 MB |

- `node-opcua-client` alone is enough for a client: connect, sessions, read, write,
  subscriptions, monitored items, namespace array, `DataType`, `Variant`, `StatusCodes`,
  `AttributeIds`, security enums (460 exports checked).
- It does NOT export `OPCUACertificateManager`. Passing your own PKI (needed, section 3)
  requires `node-opcua-certificate-manager` as a direct dependency (it is already in the
  tree, so no extra weight). With pnpm's strict layout it is not importable otherwise.
- `node-opcua-server` exports `OPCUAServer` (37 exports) but not `Variant`, `DataType` or
  `StatusCodes`; the test imports those from `node-opcua-client`. The address space types
  come from `node-opcua-address-space` (transitive); annotating them in TypeScript would
  need that package as a direct dev dependency (NOT TESTED).
- The umbrella `node-opcua` (meta package, 31 KB unpacked) is not needed.
- Install scripts: none (scan of `preinstall`, `install`, `postinstall` over every installed
  package: empty). Native addons (`*.node`, `binding.gyp`): none. No postinstall download.
  Installation needs no build step (1 to 2 s with a warm cache).
- Notable runtime dependencies: `node-opcua-pki` 7.0.4 (exact in the client), `node-opcua-crypto`
  6.1.4, `@peculiar/x509` and `@peculiar/asn1-*` (pure JS), `sshpk`, `chalk` 6,
  `@ster5/global-mutex`, and (server) `sterfive-bonjour-service` (mDNS discovery).
- Engines: `node >=22.13.0`. Package `"type": "module"`, `main ./dist/index.js`,
  `types ./dist/index.d.ts`.

### 3. PKI

Verified by running with `PATH=/nonexistent` (no `openssl`, no other tool):

- `node-opcua-pki` 7.0.4 (and 7.1.2 on npm) creates the application certificate and key in
  pure JavaScript (`dist/lib/toolbox/without_openssl/create_self_signed_certificate.js`,
  `@peculiar/x509`). Client and server both created 2048-bit self-signed application
  certificates valid 10 years (2026-10-21 to 2036-10-18), with the client taking about
  300 ms. The readme of `node-opcua-pki` still says "This module requires OpenSSL or
  LibreSSL" and the package still contains an `OpenSslCaBackend` (used for running a CA,
  not for self-signed certificates): that claim is stale for our use. A CA (issuing, revoking)
  was not tested.
- Layout under `rootFolder` (verified on disk): `own/` (`certs/`, `private/`, an
  `openssl.cnf` template that is written but not executed), `trusted/` (`certs/`, `crl/`),
  `rejected/`, `issuers/` (certs and crl), plus a `mutex/` lock folder. The own certificate is
  `own/certs/client_certificate.pem`.
- Default location when no certificate manager is passed: a global folder
  `~/.config/node-opcua-default-nodejs/PKI` (and `UserPKI` for the server's user
  certificates). Always pass an explicit `OPCUACertificateManager({ rootFolder })`
  (client: option `clientCertificateManager`; server: `serverCertificateManager` and
  `userCertificateManager`) so that a test never touches the home directory.
- Untrusted server certificate: with a secure mode and the default settings,
  `connect()` fails with `BadCertificateUntrusted (0x801a0000)` and the server certificate
  is written to `rejected/` as `<CN>[<thumbprint>].pem` (observed: the file name carries the
  SHA-1 thumbprint, `NodeOPCUA_tunnel[f6f6eea6...].pem`). The constructor option
  `automaticallyAcceptUnknownCertificate` exists (default false); not used.
- Trust programmatically: `await certificateManager.trustCertificate(derBuffer)` copies the
  certificate to `trusted/certs/`. After it, the same connection succeeds. It takes the
  certificate bytes (DER), not a thumbprint. A "trust by pinned thumbprint" feature is therefore
  ours to write: obtain the certificate (from `rejected/` after a first failure, or from
  `GetEndpoints` which returns `serverCertificate`), hash it (SHA-1, as node-opcua names it),
  compare to the pinned value, then call `trustCertificate`. Not prototyped end to end
  with `GetEndpoints`; the `rejected/` route was.
- The server side (test server) also checks the client certificate: with the client unknown
  it rejected the secure channel until the client certificate was trusted with
  `trustCertificate` as well.

### 4. Client capabilities (all measured against the in-process server unless noted)

- Fixed IP with a server that advertises another host name: the server advertised
  `opc.tcp://plc.invalid:48400/UA/Test` and the client connected to `127.0.0.1:48400`.
  With `endpointMustExist: true` (default) it failed ("End point must exist ...");
  with `endpointMustExist: false` it connected. So `endpointMustExist: false` is what
  Pantin needs when a PLC advertises a host name that the machine cannot resolve. Behaviour
  against CODESYS itself: NOT VERIFIED.
- Certificate host-name check: the server certificate had the machine host name
  (`NodeOPCUA@tunnel`) and the client reached it by IP `127.0.0.1` with Sign and
  SignAndEncrypt without error. No host-name check against the target IP was observed once
  the certificate was trusted (trust is the only gate). Not an exhaustive test of the
  application URI check.
- Security modes and policies, all with `Sign` or `SignAndEncrypt` and user/password
  tokens, write and read succeeded (`Good`) for: None/None, SignAndEncrypt
  Basic256Sha256, Sign Basic256Sha256, SignAndEncrypt Aes128_Sha256_RsaOaep, SignAndEncrypt
  Aes256_Sha256_RsaPss (policy names as in `SecurityPolicy`). Aes256_Sha256_RsaPss
  with Sign only was not run.
- Authentication: user name and password OK (`{ type: UserTokenType.UserName, userName,
  password }`). Anonymous correctly refused by a server configured with
  `allowAnonymous: false` ("Cannot find ANONYMOUS user token policy"). Anonymous success
  path not run (trivial). Note advisory CVE-2026-54155 above: user-name token handling
  had a flaw before 2.166.
- Subscriptions: `ClientSubscription.create` and `ClientMonitoredItem.create` with
  `samplingInterval: 20`, `queueSize: 5`, `discardOldest: true` delivered `changed` events
  on each value change (true, then false, within a 300 ms wait). Publishing interval
  50 ms worked. Server-side clamping of intervals was seen (`minimumSamplingInterval`).
- Write: `session.write({ nodeId, attributeId: AttributeIds.Value, value: { value: { dataType:
  DataType.Boolean, value: true } } })` returned `Good`.
- Attributes: `DataType` read returns a NodeId (`ns=0;i=1` for Boolean) and
  `UserAccessLevel` returned `3` (CurrentRead | CurrentWrite) on the test variable, using
  `session.read([...])` with `AttributeIds.DataType` and `AttributeIds.UserAccessLevel`.
- Namespace array: `session.readNamespaceArray()` returned the table, and
  `indexOf("urn:test:plc")` gave the index to build `ns=<n>;s=...` NodeIds at run time.
- Reconnection is built in. The client emitted `connection_lost`, `start_reconnection`,
  then (server back after 1.5 s) `after_reconnection` and `connection_reestablished`; the
  existing subscription and monitored item continued, 100 notifications in the following
  6 s with no code of ours. Strategy options: `connectionStrategy: { initialDelay, maxDelay,
  maxRetry: -1 }` (infinite retry). `reconnection_attempt_has_failed` exists too. Session
  keep-alive is on by default (`keepSessionAlive`). Not tested: a PLC cold restart (new
  session, node values changed), long outages, clock skew, half-open TCP.
- Listening socket: the client never listens in normal use. In `node-opcua-client`,
  `net.listen` appears only in `reverse/client_reverse_connect.js`, class
  `ClientReverseConnect`, used only if the caller creates it and calls `connectReverse`.
  Not used by default (source read, not a socket-level test of a client-only process).

### 5. In-process server for tests

Measured with `OPCUAServer`:

- Starts in-process: `initialize()`, `registerNamespace("urn:test:plc")`, `start()` took
  about 1.2 to 1.5 s in total, including creating the server certificate (first start of a
  fresh PKI). Whole scenario with 5 secure sessions: about 3 s. Warm start without PKI
  creation not measured separately.
- Free port: `port: 0` works; read the actual port with `server.getEndpointUrl()` (for example
  `opc.tcp://127.0.0.1:35319/UA/Test`).
- String NodeIds in a custom namespace: `namespace.addVariable({ nodeId:
  "s=|var|Device.Application.GVL.x", dataType: "Boolean", minimumSamplingInterval: 10, value:
  { get, set } })` works; the getter must return a `Variant`, otherwise the server throws
  ("the getter must return a Variant or a StatusCode"); the setter returns `StatusCodes.Good`.
  The client addressed it as `ns=2;s=|var|Device.Application.GVL.x` after resolving the
  namespace array.
- User auth: `userManager: { isValidUser(user, password) }` and `allowAnonymous: false`
  enforced (anonymous refused, user/password accepted).
- Temporary PKI: `serverCertificateManager` with a `rootFolder` under a temp dir works.
- TRAP, listening address: with `hostname: "127.0.0.1"` the server still listened on
  every interface (`ss`: `*:46279`). `hostname` is only the advertised host. The option
  `host: "127.0.0.1"` fixes it (`ss`: `127.0.0.1:46415`). Tests must set `host`
  explicitly, in line with ADR 0004.
- TRAP, global folders: without `userCertificateManager`, the server created
  `~/.config/node-opcua-default-nodejs/UserPKI`. Give it a temp folder too.
- The server exposes `securityModes` and `securityPolicies` options, so a test can
  restrict it to one mode or to all of them.
- Remaining after `shutdown(0)`: one active resource named like a server socket in
  `process.getActiveResourcesInfo()`; the process did exit afterwards. Not analysed.

### 6. ESM, types, Node 24

- ESM: packages are `"type": "module"` (2.186.17), imported with `import` from an `.mjs`
  file on Node v24.21.0 without flag; no deprecation or warning from the runtime
  itself.
- Types: `.d.ts` shipped next to `dist/*.js`; the typings were read, but no `tsc` run with
  Pantin's strict settings (`strict`, `noUncheckedIndexedAccess`) was done: NOT VERIFIED.
  The library's own source is TypeScript.
- Node 24: engines `>=22.13.0`, all runs on 24.21.0 passed. `@types/node` 26.6.5 is in the
  tree as a dependency of node-opcua packages (type clash with the repo's `@types/node`
  version is possible: NOT VERIFIED).
- Logging: the library writes to stdout (`NODE-OPCUA-W..` warnings, certificate
  detail lines) by default, which matters if the bridge process uses stdout as a
  channel. Control through `NODEOPCUA_DEBUG`-style env variables was not checked.

### 7. Alternatives

- open62541 for Node: no maintained npm binding found. Registry searches for `open62541` and
  `node-open62541` returned nothing relevant (the names `node-open62541` and `open62541`
  return 404). One third-party package, `@tier0/opcua-client` 0.6.0 (2026-09-03), says it is
  Node-RED nodes "powered by open6..." (description truncated, not examined). open62541 itself
  (C library) is MPL-2.0, last push 2026-10-21 (GitHub API). It would be a native addon:
  against Pantin's "no install scripts" preference.
- Other maintained pure-JS client: none found. `opcua-client` on npm is unpublished
  (2023-08-20). `@node-wot/binding-opcua` 0.9.2 and `node-red-contrib-opcua` build on
  node-opcua.
- Python `asyncua` (CLAUDE.md names it for OPC UA "later"): licence on PyPI 2.1.0 is
  "GNU Lesser General Public License v3 or later"; GitHub FreeOpcUa/opcua-asyncio reports
  LGPL-3.0, last push 2026-10-10. For the record: weak copyleft, unlike MIT. Not used by
  this plan.

### 8. CODESYS facts from public documentation

Reported (vendor documentation or vendor-certification pages, page-level checks below):

- Default OPC UA server port 4840: the official CODESYS Control page lists it among the
  default ports, which "can be modified by means of the configuration". Obtained through a
  search summary of https://content.helpme-codesys.com/en/CODESYS Control/_rtsl_start_page.html
  (the page itself returned HTTP 403 to the fetch tool). Confirmed as 4840 by other vendors'
  tables (ABB PM56xx, SEW-EURODRIVE, via search). So "4840" is documented, but the exact
  CODESYS Control Win V3 x64 behaviour is NOT VERIFIED on a real server.
- Symbol Configuration: "Support OPC UA features" is a setting of the Symbol Configuration
  object (also visible as `settings="SupportOPCUA, ..."` in the real export of spike 0012).
  Only community guides say the variables are not exposed until each is ticked
  (https://forums.opto22.com/t/codesys-programming-and-ui-access/2361). Official wording
  NOT VERIFIED.
- Security (https://help.plc.abb.com/_cds_comm_device_security_settings.html, a vendor
  mirror of the CODESYS device security settings page, fetched): default CommunicationPolicy
  "Start from Aes128Sha256RSAOAEP (default setting)"; default CommunicationMode
  SECURE_IF_POSSIBLE; "Transmission of passwords in clear text is not allowed"; with
  UserAuthentication ENFORCED the anonymous token is disabled. Applies to a runtime
  version that offers these settings (SP17 and later per the CODESYS pages seen); the
  Win V3 x64 SoftPLC defaults NOT VERIFIED.
- Authentication: https://help.plc.abb.com/_cds_OPC UA Server.html (fetched): "a device user
  management has to be set up by default" on 3.5 SP17 and higher, anonymous access only if
  explicitly permitted in "Change Communication Policy"; profile "Basic256SHA256" mentioned.
- OPC Foundation certification listing for the CODESYS OPC UA Server (fetched,
  https://opcfoundation.org/products/view/codesys-opc-ua-server/): version 3.5.21.0,
  certified builds Windows 3.5.21.10 and Linux 4.15.0.0, security policies None,
  Basic256Sha256, Aes128-Sha256-RsaOaep, Aes256-Sha256-RsaPss, user tokens Anonymous and
  User Name Password, certificate dated 2025-07-17. This matches the three policies
  required here (Basic256Sha256, Aes128_Sha256_RsaOaep, Aes256_Sha256_RsaPss).
- Namespace URI of `|var|` nodes: NOT VERIFIED. No official page states it. Spike 0012
  gives `ns=4` in examples only; the client must read the namespace array and find the
  URI at run time.

## NOT VERIFIED (needs a real CODESYS server)

- Which endpoint(s), security modes and policies the Win V3 x64 SoftPLC offers by default,
  and whether node-opcua negotiates one without tuning.
- Host name advertised in its endpoint descriptions and whether `endpointMustExist: false`
  is enough (it was against a test server).
- How CODESYS presents its application certificate (self-signed, chain, SAN with IP or host
  name, application URI) and whether the client application URI check passes.
- Whether the SoftPLC rejects our client certificate until it is trusted on the PLC side
  (the IDE's "trusted certificates" store) and how Pantin tells the user to do it.
- The exact `|var|` NodeId rule (device name part) and the namespace URI for `|var|` nodes.
- Behaviour of subscriptions, queue size and sampling interval limits on CODESYS (minimum
  publishing interval, number of monitored items).
- Behaviour on a PLC stop/start or online change (nodes disappearing, session lost) and on
  a cold restart; clock skew case of CVE-2026-68904 on the real runtime.
- Data types of real symbols (BOOL, INT, REAL, structs) as seen through `DataType` and
  `Variant`, and `UserAccessLevel` for `symbol := 'read'` variables.
- Strict TypeScript compile of the imports (`noUncheckedIndexedAccess`).
- The five packages with no licence field, and a warm-start timing of the test server.

## What a prototype needs (not installed here)

Dependencies, all exact: `node-opcua-client@2.186.17` and `node-opcua-certificate-manager@2.186.17`
(runtime, bridge); `node-opcua-server@2.186.17` (dev, tests); optionally `node-opcua-address-space`
at the same version (dev, only for type annotations). The user must approve these before
any `pnpm add` (CLAUDE.md section 8 and 14).

## Conclusion

- Fit: yes. Pin `node-opcua-client`, `node-opcua-certificate-manager`
  (runtime, bridge only) and `node-opcua-server` (dev) all at `2.186.17`, no caret, bumped by
  hand with a pnpm audit and a read of the release notes. Newer 2.187.x exists but is under two
  weeks old.
- Risks: one maintainer; extremely frequent patch releases and four advisories in 2026
  (all fixed, but they concern authentication and reconnection, the exact areas we use);
  76 MB and 140 packages for the dev tree (33 MB, 127 packages for the bridge); a global
  PKI folder and a listen-on-all-interfaces default in the server that tests must override;
  trust management by thumbprint is ours to write; library logging on stdout;
  `node-opcua-pki` readme still speaks of OpenSSL (stale for our use, a CA is untested).
- Tests: in-process server with `host: "127.0.0.1"`, `port: 0`, temp PKI for server and
  client and user certificates, string NodeIds `|var|...` in a custom namespace.
- Real server needed for: sections listed under NOT VERIFIED above.
