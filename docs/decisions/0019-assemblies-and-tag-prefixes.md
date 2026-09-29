# 0019. Assemblies: grouping bodies and prefixing tags

- Status: accepted
- Date: 2026-09-29
- Extends: ADR 0017 (STEP import joints), ADR 0011 (kinematic joints)
- Supersedes: ADR 0012 point 1 (tag names)
- Depends on: ADR 0018 (type change keeps the id)

## Context

A Pantin will hold 5 to 10+ imported devices (cylinders, motors). The tree
and the 3D view become unreadable, and joint ids are unique per Pantin, so
a second cylinder's rod joint becomes `tige-2` and its tags
`tige-2.setpoint` / `tige-2.position` (joint-tags.ts). Nobody consumes tags
yet (the PLC bridge is phase 7): renaming them now is free, later it breaks
I/O lists and PLC programs.

An assembly is a product structure concept (bill of materials, CAD
assembly), not a kinematic one: it never enters pose computation (ADR 0011).
It settles what a Pantin is: the machine, made of assemblies. It is the
future basis of a part instance (docs/backlog/part-instances-and-interfaces.md);
this ADR adds no reuse, no shared definition, no library.

Names from CAD are often codes: on the user's real cylinder, the root
product is `ID1S0400125E_0` and a body `ID1S040CF-16040_3`. Keys derived
from them once and frozen would give tags such as
`id1s0400125e-0.id1s040cf-16040-3.position`.

Facts checked in the repository on 2026-09-29:

- `pantin.json` is at schema_version 3 (pantin.ts:10); one pure migration
  per step (migrations.ts).
- Ids allow lowercase letters, digits and dashes, not `_` (ids.ts); no dot,
  so "." is a safe tag separator.
- The converter lists each component's node chain from its root
  (assembly.py:49-80) and the core copies it (step-bodies.ts):
  `source.nodes[0]` is the root product. On the user's two real files every
  body shares it, at path [0]. A STEP file with several roots gives bodies
  with different `nodes[0]`.
- Two imports of one file give the same `source.fileName`: grouping
  existing bodies by import from `source` is not reliable, and fails in the
  target case (two cylinders from one file).
- Runtime state is keyed by joint id (open-pantins.ts); poses by body and
  joint ids. Nothing in the core is keyed by a tag name.

NOT VERIFIED: the identifier rules of CODESYS. They concern the variables
the CSV generator produces from tag names (CLAUDE.md section 5), not the tag
names.

The user approved this decision on 2026-09-29, including `_` in keys and
bringing assemblies forward from phases 8 and 9.

## Decision

1. `pantin.json` gets an `assemblies` array. An assembly has a `key` (used
   in tags and routes) and a display `name`. Assembly keys are unique per
   Pantin.
2. Every body gets a required `assembly` field: the key of its assembly. A
   body belongs to exactly one assembly by construction; the document schema
   checks that the key exists. An assembly may be empty.
3. Each import creates one assembly, named after the root product
   (`source.nodes[0].name`) when every body of a STEP import shares it,
   otherwise after the file name; GLB and STL after the file name. The
   ADR 0017 star of fixed joints lives inside it. The import rollback
   removes, in order, the joints, the bodies, then the assembly.
4. A joint is internal when its parent and child share an assembly,
   otherwise it is a joint between assemblies. This is derived, not stored.
5. Every joint gets a stored `tagKey`, fixed joints included: a fixed joint
   exposes no tag, but its key is the one used when it becomes movable
   (ADR 0018). Tag keys are unique among the joints whose child body is in
   the same assembly. The joint `id` stays unique per Pantin and keeps every
   joint route unchanged.
6. Tag names become `<assemblyKey>.<tagKey>.setpoint` and
   `<assemblyKey>.<tagKey>.position`, where the assembly is the child
   body's (the child is what moves).
7. Keys follow one pattern: lowercase letters, digits, `-` and `_`, 1 to 64
   characters, a letter or digit at both ends. At creation they are derived
   from the display name (the same slug as ids) and made unique.
8. Keys are independent from display names: renaming an assembly or a
   joint never changes a tag. Each key changes only through its own
   explicit operation:
   - `PUT .../assemblies/:assemblyKey/key` with `{ key }`,
   - `PUT .../joints/:jointId/tag-key` with `{ tagKey }`.
   Each answers the renamed tags as `[{ from, to }]` (empty for a fixed
   joint). A key already taken, or not matching the pattern, is refused
   with a message naming the conflict and a free alternative. Workflow:
   import, rename once to `verin_pince` and `tige`, stable afterwards.
9. A body can move to another assembly (`PUT .../bodies/:bodyId/assembly`).
   Its parent joint follows; if its tag key is taken there, the move is
   refused with a message asking to rename the tag key first. The response
   lists the renamed tags `[{ from, to }]`, and the viewer shows them.
10. Deleting a non-empty assembly is refused (`conflict`), with a message
    asking to move or delete its bodies first.
11. Assemblies are flat: no nesting (the converter flattens STEP
    sub-assemblies, assembly.py:49-80).
12. schema_version 3 -> 4. Migration: one assembly with key `main`, named
    "main", holding every body; each joint's `tagKey` is its id (ids are
    unique per Pantin, so per assembly too, and match the key pattern).
13. Viewer: the tree shows assemblies > bodies and internal joints, then a
    top-level "joints between assemblies" folder. In 3D, a first click
    selects the assembly and a double click the body. An assembly can be
    hidden or isolated (display state, never saved). After a key rename the
    viewer carries its tree and display state over to the new key.

## Rejected alternatives

- Joint ids unique per assembly, routes through the assembly
  (`assemblies/:assemblyId/joints/:jointId`): every joint route, the pose
  response, the runtime maps, the rollback and the viewer's node ids switch
  to a composite key, and moving a body would change a joint's URL.
- Keys frozen at creation, derived from CAD names: unreadable tags forever
  on real files (see Context).
- Keys that follow the display name: a cosmetic rename would break the PLC
  mapping.
- Moving a body with an automatic `-2` suffix on collision: brings back the
  `tige-2` tags this ADR removes.
- Keys limited to the id pattern (no `_`): `verin-pince` instead of
  `verin_pince`; the user chose `_`.
- A list of body ids per assembly: "exactly one assembly per body" becomes
  a cross-check, and every body removal must edit the lists.
- Migration grouping bodies by `source`: unreliable (see Context).
- Nested assemblies, part definitions reused across instances: not needed
  yet; the latter stays in the backlog (ADR 0002).

## Consequences

- Public schema, API responses and tag names change, approved by the user
  on 2026-09-29 (CLAUDE.md 14.6, 14.8).
- Every existing tag is renamed (`verin.position` -> `main.verin.position`).
  Free now, not later.
- ADR 0012 links here ("Partly superseded by").
- Key renames and body moves rename tags; the PLC mapping (phase 7) will
  subscribe by tag name and must show such renames.
