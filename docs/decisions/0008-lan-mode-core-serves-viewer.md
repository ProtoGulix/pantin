# 0008. LAN mode: the core serves the built viewer

- Status: accepted
- Date: 2026-09-28
- Implements: ADR 0004 (LAN mode), first part

## Context

ADR 0004 allows a `lan` mode: one explicit private listen address, sources
filtered on accept before any read. The Vite development server cannot filter
connections by source address, so it must never listen beyond loopback.

## Decision

1. In every mode the core can serve the built viewer (`packages/viewer/dist`)
   as static files on its own port, next to `/api`. The directory is passed
   explicitly (`--viewer-dir`); the core never imports viewer code, so the
   package boundary stays intact.
2. The Vite development server stays on 127.0.0.1 in all cases. Access from
   another machine goes through the core in `lan` mode, or through an SSH
   tunnel.
3. `--listen <address>` selects the mode: absent or loopback means `local`;
   a single private address (RFC 1918, fc00::/7) means `lan`. Public,
   wildcard (0.0.0.0, ::), link-local and anything that is not one literal
   address make the core refuse to start with an actionable message.
4. In `lan` mode each connection is checked in the server's `connection`
   event, before any byte is read: sources outside the private ranges and
   loopback are destroyed. IPv4-mapped IPv6 sources are normalised first.
   `--allow <ip or cidr>` (repeatable) narrows the accepted sources further.
5. The `Host` check (ADR 0006) accepts `<listen address>:<port>`, plus
   `localhost` and `127.0.0.1` in `local` mode only.
6. Static files: GET and HEAD only, served from inside the viewer directory
   (realpath containment, no symlinks), `index.html` for `/`, content type
   from a fixed extension table, `nosniff` on every response.

## Exception to CLAUDE.md section 8

`--listen` and `--allow` are external input parsed by a hand-written parser
(`domain/network-address.ts`) rather than a Zod schema, because it is stricter
than Zod's IP formats (zone ids, embedded IPv4, mapped CIDRs). When the JSON
network configuration lands, its Zod schema will call this parser.

## Deferred (still required by ADR 0004)

The JSON network configuration editable from the UI, the automatic rollback
after 60 seconds without confirmation, and the local emergency command
`pantin network reset`. They come with the first UI able to change the
network settings; until then the address is chosen at startup, on the host.

## Rejected alternatives

- Exposing Vite on the LAN (`--host`): no source filtering, development
  server not meant to be exposed.
- A separate static file server: a second listening socket to secure.

## Consequences

- Using Pantin from another machine requires `pnpm --filter @pantin/viewer
  build` first; the viewer's hot reload is only available locally.
