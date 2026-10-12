# dependency-cruiser hides npm dependencies served from dist/

The `exclude` option of `.dependency-cruiser.cjs` drops every path with a
`dist/` folder, so an import of an npm package whose entry sits in its own
`dist/` (vitest, Rapier) is invisible to every rule. Rapier got a carve-out in
ADR 0043 P0. Narrowing the exclude to `^packages/[^/]+/dist/` shows five
violations that already exist, all `no-dev-dependency-in-sources`: vitest
imported from test helpers such as `packages/core/src/test-support/expect-point.ts`
and `alignment-bench.ts`, in core and viewer (found by the P0 review on
2026-10-12). Fix: narrow the exclude, then move those helpers under a path the
rule treats as test code, or allow them explicitly with a reason.
