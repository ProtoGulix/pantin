# 0002. Part descriptor schema

- Status: proposed (schema itself is written and validated in phase 1)
- Date: 2026-09-28

## Context

A part must be a self-contained folder that anyone can add without touching
the core (CLAUDE.md sections 3.3, 5 and 11). Its description must be text,
versionable in git, and validated before it enters the domain.

## Decision

1. A part is a folder holding `manifest.json`, its model files, a scenario
   test and a README.
2. The manifest is JSON. Its schema is written in Zod in `@pantin/protocol`,
   which is the single source of truth; the JSON Schema is exported from it
   for editors and non TypeScript tools.
3. Every manifest carries `schema_version` (integer), `core_compat` (semver
   range) and `license` (SPDX identifier, mandatory).
4. A part is declarative: bodies, joints, drives, sensors, tags. Elements
   reference each other by local `id`; tags are prefixed by the instance name
   at scene level (`instance.tag`), never inside the part.
5. Values are SI (metres, radians, seconds), Z up. Only mesh files carry a
   declared `unit`, converted at load time.
6. Joint, drive and sensor entries are discriminated unions on `type`,
   `mode` or `kind`, so future types are added without rewriting existing ones.
7. A published schema never changes without incrementing `schema_version`
   and shipping a migration in the core.

## Rejected alternatives

- YAML manifests: comments are nice, but implicit typing (`no`, `1e3`) causes
  silent errors, and JSON is what the editor UI will write back.
- URDF or SDF: robot formats with physics inertia fields we do not need, no
  notion of PLC tags or drives, and XML is harder to diff and validate with Zod.
- Scripted parts (code in the folder): rejected by default until a sandbox
  exists (CLAUDE.md section 11.3); a later ADR will cover it.

## Consequences

- The example manifest in CLAUDE.md section 5 becomes the first phase 1 test
  fixture.
- Any tool (CLI, viewer, bridge) validates manifests through the same Zod
  schema.
