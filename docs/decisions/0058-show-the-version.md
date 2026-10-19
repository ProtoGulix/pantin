# 0058. Show the version in Pantin and in the user guide

- Status: accepted (user, 2026-10-19)
- Date: 2026-10-19
- Extends: ADR 0044 (branches and releases), ADR 0051 (user guide)

## Context

Pantin has released v0.1.0, but no screen and no guide page says which
version is running. The user runs the core from develop on pantin-dev, where
the viewer is often kept in the browser cache after an update: nothing shows
that the viewer and the core come from different code.

## Decision

1. The version is the `version` field of the workspace packages, all kept
   equal (ADR 0044). Nothing else holds a version number.
2. The displayed version is the build version: the package version when the
   commit carries the matching tag `v<version>`, otherwise
   `<version>+<short commit>`, for instance `0.2.0+8b4e4c4` on develop after
   0.2.0 (SemVer build metadata: code built after that version). Without
   git (an archive), it is the package version alone. One function computes
   it, for the viewer build, the core and the guide.
3. The core answers `GET /api/version` with `{ version }`, validated by a Zod
   schema in protocol. It reads its version once at start-up.
4. The viewer receives its own build version at build time. A new **Help**
   menu holds **Documentation** and **About Pantin…**; the About window shows
   the viewer and core versions, the licence and links to the guide and the
   repository. When the two versions differ it says so with a warning glyph
   and text (ADR 0057) and suggests reloading the page. The welcome window
   shows the version in its footer.
5. The user guide shows the build version in its header, as a menu leading
   to the CHANGELOG and the GitHub releases.
6. The function lives in `packages/core/src/build-version.ts`, because the
   core needs it at run time. It imports only node builtins and zod.
   `packages/viewer/vite.config.ts` and `docs/site/.vitepress/config.ts`
   import it by relative path, as build tooling run by Node, never bundled.
   This is the only exception to the core and viewer isolation (CLAUDE.md
   section 4): `.dependency-cruiser.cjs` lets exactly that viewer config
   import exactly that file. The VitePress config sits outside the paths
   dependency-cruiser checks, so nothing enforces its side.

## Alternatives set aside

- Version alone on develop: hides which commit pantin-dev runs.
- The function in protocol or in a root script: protocol holds no logic and
  no node builtins, and core's `rootDir` keeps it from importing scripts/.
- One copy per consumer: three sources of truth for one format.
- Viewer version only, no route: cannot detect a stale cached viewer, the
  case the user meets after each core restart.
