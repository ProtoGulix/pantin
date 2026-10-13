# The cost of adding a primitive kind

Adding a phase 6 kind (rollers, curved belts) means touching many files in
three packages. CLAUDE.md section 3.3 warns against exactly this: "adding a
part must never require changing the core", with FactoryForge's eight shared
files per part as the counter-example.

## Measure

Non-test files that name "absorber" (case-insensitive), counted as a proxy for
"a phase 6 kind is named here". Method: `git ls-files packages | xargs grep -li
absorber`, then drop `*.test.ts`.

| Date | protocol | core | viewer | Total |
| --- | --- | --- | --- | --- |
| 2026-10-13 (ADR 0047) | 6 | 14 | 28 | 48 |
| 2026-10-13 (this note) | 7 | 14 | 29 | 50 |

The two counts differ by two files. The protocol gain is probably the generated
`packages/protocol/schema/pantin.schema.json`, and the viewer files include
`i18n/locales/en.json` and `fr.json`; which files the first count included is
NOT VERIFIED. 52 test files name the word as well. Outside `packages`, only
`examples/axis/pantin.json` and `CHANGELOG.md` do.

The proxy is rough: "absorber" is the fifth of five kinds, so a file that
loops over all kinds may name it only through a shared list. A real
measurement is the next kind's diff.

## Where the files are

- protocol: ids (`ids.ts`), the schemas and rules (`pantin-conveyors.ts`),
  the document (`pantin.ts`), the create and response schemas
  (`conveyor-api.ts`), `api.ts`, `assembly-api.ts`, the generated JSON Schema.
- core: the rules and edits (`conveyor-rules.ts`, `conveyor-edits.ts`), the
  routes (`http/conveyor-routes.ts`), the operations
  (`service/conveyor-operations.ts`), assembly contents, edits and deletion,
  object poses, the physics step plan, absorption, the migration, the document
  parser, and two test fixtures.
- viewer: the API calls, the controller and actions, the form, request,
  fields, drawing, selection and kinds modules of `conveyors/`, the
  inspector, the property rows, the 3D meshes and viewport, the icons, the
  toolbar and panel intents, the viewer state, both locale files and
  fixtures.

Some of these already follow one table per kind: `CONVEYOR_KINDS` and its
readers (`viewer/src/conveyors/conveyor-kinds.ts`), the kind descriptions of
`core/src/domain/conveyor-edits.ts`. They cut the work of a new kind inside
one module, not across the modules above.

## The lead

A registry per object kind, as the viewer tree now has in
`viewer/src/tree/device-families.ts` (ADR 0047 point 6): each kind is one
entry (icon, label, reader, detail, optional capabilities), and a test fails
when a kind has no entry. The same shape could serve the protocol (schema,
rules), the core (edit, pose, physics plan) and the viewer (form, drawing,
inspector), so that a new kind is one entry per package rather than one edit
per file.

Open questions, for the ADR:

- whether the protocol keeps one flat array per kind (`belts`, `guides`...) or
  moves to a single list of objects discriminated by `kind`. The second makes
  a registry natural and is a public schema change, so it needs a
  `schema_version` increment and a migration;
- how much of a kind (physics for a roller, drawing for a curve) is truly
  one entry, and how much stays specific;
- the ADR 0047 rule "every element carries an `assembly`" (joints are the
  exception, see guides/pantin-document.md) must stay true for
  every entry.

This needs an ADR before any code, and the agreement of the user for a
change to the public schema (CLAUDE.md section 14.8).
