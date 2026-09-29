# 0014. Development exposure through a Cloudflare tunnel

- Status: accepted
- Date: 2026-09-29
- Departs from: ADR 0004 (local by default, private LAN at most), for the
  development machine only

## Context

The user needs to reach the Pantin under development from outside the
development machine, on a subdomain of frezille.fr, as the other projects of
that machine already are (for example tunnel-dev.frezille.fr). The user asked
for it on 2026-09-29, knowing it goes beyond ADR 0004. That machine already
runs a Cloudflare tunnel (`cloudflared`, managed from the Cloudflare
dashboard) that hands every subdomain to the local nginx, which dispatches by
`server_name`.

Pantin has no authentication (ADR 0004, "What this filter is not"): whoever
reaches the API can create, change and delete Pantins, write mesh files and
run the STEP converter.

## Decision

1. The core itself does not change and keeps listening on 127.0.0.1 only
   (`local` mode). The exposure is entirely outside it:
   Cloudflare → `cloudflared` → nginx → `127.0.0.1:4800`.
2. The subdomain is `pantin-dev.frezille.fr`. Its public hostname in the
   tunnel points to the local nginx (`http://localhost:80`), like the other
   subdomains.
3. Cloudflare Access protects the subdomain before any request reaches the
   machine: a policy that allows only the user's email address, logged in by
   a one-time code. Without that policy, the subdomain is not published.
4. The core serves the built viewer and the API (`pnpm serve`, ADR 0008).
5. The nginx site accepts connections from loopback only (`allow 127.0.0.1;
   allow ::1; deny all;`), where `cloudflared` connects from. nginx listens
   on every interface of the machine: without this rule, anyone on the LAN
   could send `Host: pantin-dev.frezille.fr` and reach the core without
   Access. The `X-Forwarded-Proto` check is a redirect convenience, not a
   control: the header can be forged.
6. nginx rewrites the `Host` header to `127.0.0.1:4800`. The core's Host check
   (protection against DNS rebinding) stays unchanged; nginx is the only
   component that turns the public name into the core's address.
7. The nginx site is versioned in `deploy/dev-exposure/` and installed by
   hand; nothing in the repository applies it automatically.

## Rejected alternatives

- Accepting the public name in the core's Host check: it would weaken the
  DNS rebinding protection for every installation, for the needs of one
  development machine.
- nginx basic authentication: a password sent with every request and stored
  on the machine, weaker than Access, which filters at Cloudflare's edge.
- No protection: the API writes and deletes files on the machine.
- The Vite dev server behind the subdomain: its port 5173 is taken on that
  machine, and it would need its own host allowlist; the built viewer is
  enough for now.

## Consequences

- Anyone allowed by the Access policy has the full API. From outside the
  machine, the Access policy and the loopback rule of point 5 are the only
  barriers; removing the policy means unpublishing the subdomain.
- The core sees every proxied request as coming from 127.0.0.1: ADR 0004's
  source filter and allowlist cannot tell these clients apart.
- Any process running on the machine can reach nginx or port 4800 directly,
  as before this ADR.
- The origin does not check the Access token (`Cf-Access-Jwt-Assertion`).
  Not needed while the loopback rule holds; required before any shared or
  longer-lived exposure (docs/backlog/access-token-at-origin.md).
- This does not cover production or a PLC network: ADR 0004's requirement of
  a new ADR before any such exposure still holds.
- NOT VERIFIED: whether port 80 of the machine is reachable from the
  internet (router, firewall). The loopback rule makes it irrelevant for
  Pantin, not for the other sites of the machine.
- NOT VERIFIED: Cloudflare limits the request body size by plan (100 MB on
  the free plan according to its documentation); imports larger than that
  limit would fail through the subdomain while working locally.
- The tag bus (WebSocket, CLAUDE.md section 9) will need the upgrade headers
  that the nginx site already forwards.
