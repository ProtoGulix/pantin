# 0017. STEP import creates the fixed joints of the assembly

- Status: proposed
- Date: 2026-09-29
- Extends: ADR 0009 (STEP import), ADR 0011 (kinematic joints)

## Context

ADR 0009 turns each leaf component of a STEP assembly into one body but
creates no joint. The bodies stay independent and motionless, and moving the
assembly as a whole means creating one fixed joint per body by hand. ADR 0011
already composes poses along the joint tree, so a branch of that tree moves
as a group and no new concept is needed.

Facts checked in the repository on 2026-09-29:

- A fixed joint requires `name`, `parent`, `child`, `origin` and `axis`
  (common.ts:28-34); the axis cannot be the zero vector (common.ts:14).
- The core derives a joint id from its name, not from body ids (joint.ts:51).
- `addJointToDocument` (joint-rules.ts:59) is the function through which the
  API creates joints: it checks the links and the cycles and makes the joint
  id unique. Joint ids and body ids are two separate id spaces
  (joint-rules.ts:67). Its checks only look at the document it receives, so
  calling it once per component, each time on the previous result, is safe:
  fresh bodies have no parent joint and the root is never a child.
- The converter walks the assembly tree in depth and keeps only the leaves
  (assembly.py:49-80); each body gets its full path in `source.nodes`. A
  nested assembly therefore gives a flat list of bodies.
- `PATCH .../joints/:jointId` replaces the whole joint, type included, and
  keeps its id (api.ts:127-129).
- The import already deletes its bodies when it fails
  (import-operations.ts:36-44) and reserves their ids in one synchronous
  step (`reserve`, import-operations.ts:53).

NOT VERIFIED: an import of a real nested assembly (spike 0001 had one level).

## Decision

1. When a STEP file yields several components, the import also creates
   fixed joints: the first component is the root, every other component is
   the child of a joint whose parent is the root. A single component creates
   no joint.
2. Each joint has `origin` [0, 0, 0] and `axis` [0, 0, 1] (Z up). Both are
   irrelevant to a fixed joint, which never moves, but the schema requires
   them. Its `name` is derived from the name of the child body. The import
   creates joints through `addJointToDocument`, so that link checks, cycle
   checks and unique ids are the same as for a joint created by the API and
   are not rewritten inside the import.
3. A group is a branch of the joint tree and its root body is its handle: a
   joint whose child is that root moves the whole group. No group entity, no
   schema change, `schema_version` unchanged (the `joints` array exists since
   version 2).
4. The import is all or nothing. Joints are created in the same synchronous
   step as the bodies, as `reserve` already does for bodies (the two id
   spaces stay separate). On failure the rollback removes the joints first,
   then the bodies, so that no joint ever points to a missing body.
5. `ImportBodiesResponseSchema` (api.ts:98) becomes `{ bodies, joints }`.
   GLB and STL imports answer `joints: []` explicitly.
6. Turning a fixed joint into a slider or a pivot uses
   `PATCH .../joints/:jointId`. The id survives the change, so the tags
   derived from it (ADR 0012) stay stable.
7. A second import into the same Pantin creates its own independent star,
   consistent with ADR 0011: nothing links two imports unless the user
   creates a joint.

## Rejected alternatives

- Parts with a `root_body`, named interface frames and joints between part
  instances: it needs part instances, which do not exist yet (ADR 0002,
  ADR 0012). Recorded in docs/backlog/part-instances-and-interfaces.md.
- Several meshes or nodes listed in one body: ADR 0009 already produces one
  GLB and one body per leaf component, so a body never needs to reference
  several nodes of an assembly.
- One rigid body per import, split by hand: simplest to code, but keeps the
  manual work the import is meant to remove.
- One star per sub assembly (the first component of each sub assembly is
  the root of its group), using the paths in `source.nodes`: cheap, but
  untested on a real nested file. Deferred until such a file has been
  imported; the flat star is then replaced or refined by a new ADR.

## Consequences

- The import response is a public API change: it needs the user's approval.
- Deleting the root body requires deleting its N-1 joints first (ADR 0011
  point 7 unchanged). A cascading delete would contradict that point and
  needs a separate agreement.
- The first component as root is arbitrary. The rail is usually the right
  root, but changing the root means modifying every joint of the star, one
  `PATCH` per joint, since each component is a child of the root.
- Each call to `addJointToDocument` validates the whole document, so an
  import costs time quadratic in its number of components. Negligible today;
  it joins the component cap that server mode already needs (ADR 0009).
- The import route and its rollback gain tests: joints created for several
  components, none for one component, none for GLB and STL, rollback of
  joints and bodies together, in that order.
