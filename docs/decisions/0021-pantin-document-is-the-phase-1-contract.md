# 0021. The Pantin document is the phase 1 contract

- Status: accepted
- Date: 2026-09-29
- Partly supersedes: ADR 0002 (part descriptor schema)

## Context

Phase 1 (CLAUDE.md section 13.1) asks for the contract schemas, their JSON
Schema export and a command line validator, and ends when "the example
manifest is valid and a broken manifest gives a clear error". The work went
on without closing it: the Pantin document (`pantin.json`, schema version 4)
became the real format, with its migrations, while the part manifest of
ADR 0002 stayed proposed and unused. Since ADR 0019 a Pantin is a machine
made of assemblies; a reusable part would be a future assembly instance
(docs/backlog/part-instances-and-interfaces.md), which nothing uses yet.

Facts checked in the repository on 2026-09-29:

- Zod 4.6.5, already pinned in protocol and core, exports JSON Schema
  (`z.toJSONSchema`): no new dependency.
- `packages/cli` is empty (`src/index.ts` exports nothing).
- The dependency rules isolate core, viewer and bridge from each other
  (.dependency-cruiser.cjs); the CLI may import protocol and core.
- Reading a `pantin.json` of any older version needs the core's migrations
  (core/src/domain/migrations.ts); the protocol holds no logic.
- The document rules written with `superRefine` (joint tree, assemblies,
  tag keys) cannot be expressed in JSON Schema.

The user chose this option and accepted this ADR on 2026-09-29.

## Decision

1. The phase 1 contract is the Pantin document (`PantinDocumentSchema`),
   the REST contract (api.ts, assembly-api.ts) and the tags (tag.ts). The
   part manifest of ADR 0002 moves to phase 9, with assembly instances;
   ADR 0002's rules that still hold (JSON, Zod as the single source,
   `schema_version`, SI units, discriminated unions, migrations) apply to
   the Pantin document already.
2. The JSON Schema of the Pantin document is generated from the Zod schema
   into `packages/protocol/schema/pantin.schema.json`, committed so that
   editors can reference it. A test fails when the committed file differs
   from a fresh generation. Its description says that some rules (joint
   tree, assemblies, tag keys) are only checked by the validator.
3. `pantin validate <folder>` (packages/cli) checks a Pantin folder without
   a running core: it reads `pantin.json` through the core's pure document
   parser (migration then validation), then checks that every body's mesh
   file exists in the folder. It prints one actionable line per problem and
   exits 0 when valid, 1 otherwise. It writes nothing: a migrated document
   is reported, not saved.
4. `pantin schema` prints the JSON Schema; the generation of point 2 uses it.
5. `examples/axis/` holds a minimal valid Pantin (two STL bodies, one
   prismatic joint, one assembly). The phase 1 exit criterion becomes: the
   validator accepts `examples/axis` and refuses broken copies of it with a
   clear message, tested in CI.
6. The command runs from the repository (`pnpm pantin ...`); nothing is
   published under the name Pantin, whose availability is NOT VERIFIED
   (CLAUDE.md section 4).

## Rejected alternatives

- Defining the part manifest of ADR 0002 now, next to the Pantin document:
  a second format that nothing reads or writes yet.
- A validator that talks to a running core through the API (CLAUDE.md
  section 3.4 makes clients go through the API): a CI job or a user would
  have to start a server to check a folder. The validator changes no state,
  so it reads the core's pure parser directly.
- Moving the migrations into the protocol so that the CLI does not import
  the core: the protocol holds no logic by design.
- Generating the JSON Schema at build time only: editors need a file at a
  stable path.

## Consequences

- ADR 0002 gets one line: "Partly superseded by: ADR 0021". It stays the
  starting point of the part manifest in phase 9.
- The core exposes its document parser to the CLI (an export of its
  package entry); a change to it is visible to the validator at once.
- Phase 1 can be closed once point 5 passes; then phase 4 (drives).
