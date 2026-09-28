# 0001. Technology stack

- Status: proposed (tooling part accepted; runtime part pending phase 0b spikes)
- Date: 2026-09-28

## Context

Pantin needs a headless core that a real PLC drives in closed loop, a good
looking browser viewer, and a repository kept clean at every commit
(CLAUDE.md sections 2, 3 and 8). Tool versions below were read from the npm
registry and nodejs.org on 2026-09-28.

## Decision

Tooling (accepted, in place):

| Concern | Choice | Version |
| --- | --- | --- |
| Runtime | Node.js, active LTS "Krypton" | 24.21.0 (`.nvmrc`: 24) |
| Package manager | pnpm workspace, pinned by `packageManager` | 12.6.0 |
| Language | TypeScript, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | 6.0.3 |
| Format and lint | Biome | 2.5.14 |
| Tests | Vitest | 5.0.2 |
| Package boundaries | dependency-cruiser | 18.4.0 |
| Dead code | knip | 6.38.0 |
| Git hooks | lefthook | 2.1.14 |
| CI | GitHub Actions: checkout v7, setup-node v7, pnpm/action-setup v6 | |
| Licence | Apache-2.0 | |

`pnpm check` chains format, lint, typecheck, tests, boundaries and dead code.

Runtime (proposed, to confirm by spikes): core in TypeScript on Node, Rapier
(WASM) for products and presence sensors only, Babylon.js viewer, PLC bridge
as a Python sidecar (asyncua, pymodbus) or in Node (spike 3 decides),
docker compose for server mode.

## Rejected alternatives

- TypeScript 7.0.2 (latest on npm): its JavaScript API is not published as
  stable, and dependency-cruiser 18.4.0 explicitly refuses it
  ("Support for typescript@>=7 will follow when its API is published and
  stable"), so the boundary check would silently miss TypeScript sources.
  Revisit when the tooling supports it.
- Node 26: current release but not LTS yet on 2026-09-28.
- ESLint + Prettier: two tools and more configuration for what Biome covers.
- husky: requires shell scripts per hook; lefthook keeps all hooks in one YAML.

## Consequences

- Every contributor needs Node 24 and corepack-activated pnpm.
- The runtime rows of this ADR are rewritten from the spike reports before
  phase 1; any deviation is a new ADR.
