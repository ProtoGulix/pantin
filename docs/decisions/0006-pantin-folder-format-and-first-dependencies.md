# 0006. Pantin folder format, local HTTP API and first runtime dependencies

- Status: accepted
- Date: 2026-09-28

## Context

The first vertical slice lets a user create a Pantin, import meshes, see them,
rename, save and reopen. The product word is "Pantin" (user decision,
2026-09-28): code and API say `createPantin`, `GET /api/pantins`, never
"project".

## Decision

1. A Pantin is a folder `<pantins directory>/<pantin id>/` holding
   `pantin.json` and `meshes/`. The default pantins directory is
   `~/pantin-projects`, overridable on the command line.
2. The id is the folder name, validated by `PantinIdSchema` (lowercase
   letters, digits, dashes; no dot, no slash) so that no id can escape the
   pantins directory. The display name is stored in `pantin.json` and is
   freely renamed; the id never changes.
3. Every body keeps the node names of its source file verbatim
   (`source.nodes`), separate from its editable display name.
4. `pantin.json` carries `schema_version` 1 and is validated by Zod on every
   read. Edits stay in memory until an explicit save, which writes the file
   atomically (temporary file then rename).
5. The core serves a REST API with `node:http`, no framework, listening on
   127.0.0.1 only (ADR 0004 local mode). The contract lives in
   `packages/protocol/src/api.ts`.
6. TypeScript runs directly on Node 24 (type stripping): imports use `.ts`
   extensions and only erasable syntax is allowed. Nothing is compiled for
   the core; Vite bundles the viewer.

## Dependencies approved by the user on 2026-09-28

| Package | Version (pinned) | Licence | Used by |
| --- | --- | --- | --- |
| zod | 4.6.5 | MIT | protocol, core (converter output, ADR 0009) |
| @babylonjs/core | 9.28.0 | Apache-2.0 | viewer |
| @babylonjs/loaders | 9.28.0 | Apache-2.0 | viewer |
| vite | 8.3.1 | MIT | viewer (development and build) |

## Rejected alternatives

- Fastify 5.12.5: routing and validation helpers, but few routes today and
  Zod already validates; reconsider with a measured need (streaming, large
  uploads, tag bus WebSocket).
- Autosave on every edit: simpler, but the user asked for an explicit save.
- Id derived from the display name and renamed with it: renaming a folder
  under an open editor is error prone and breaks references.

## Consequences

- A mesh imported and never saved leaves an orphan file in `meshes/`;
  cleaning it is backlog, not this slice.
- Once loaded, a Pantin stays in the core's memory: an external edit of
  `pantin.json` (text editor, git pull) is not seen until the core restarts,
  and `unsavedChanges` does not reflect it. Detecting external changes is
  backlog.
- The core rejects any request whose `Host` header is not `127.0.0.1:<port>`
  or `localhost:<port>`, so that a web page cannot reach it by DNS rebinding.
- The viewer converts the core's Z-up frame and each body's `upAxis` at one
  single boundary module.
