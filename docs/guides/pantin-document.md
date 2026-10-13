# The Pantin document

A Pantin is a folder: `pantin.json` plus a `meshes/` directory (and, once the
PLC is wired, `io.csv` and `io-modules.json`). `pantin.json` is the whole
machine: what is in it, how it moves and what the PLC can read and write. The
schema is Zod in `packages/protocol/src/pantin.ts`, which is the source of
truth; the current version is `PANTIN_SCHEMA_VERSION` (12 at the time of
writing). The JSON Schema for editors is
`packages/protocol/schema/pantin.schema.json`, generated from it (ADR 0021).

Open `examples/axis/pantin.json` first: it is the smallest valid document.
The example at the end of this guide is the smallest one that uses every
array.

## 1. The top level

Besides `schema_version` and `name`, the document holds eleven arrays. Each
array is required and may be empty. Ids are unique within their array.

- `assemblies`: groups of bodies, as in a CAD assembly. An assembly has a
  `key` (the prefix of its tags), a `name`, a `placement` (a rigid transform,
  ADR 0033) and an optional `parent`, the key of the assembly that contains it
  (ADR 0040). `parent` is product structure only; it does not move anything.
- `bodies`: one mesh each (`mesh`, a path inside the folder that ends in
  `.glb` or `.stl`),
  with the `source` it was imported from, and the `assembly` it is in. An
  optional `placement` is relative to the assembly frame.
- `joints`: link a `parent` body to a `child` body, with an `origin`, an
  `axis` and, by type, `limits`. Types: `fixed`, `prismatic`, `revolute`,
  `continuous`, `helical` (`protocol/src/joint.ts`, ADR 0011). A joint has no
  `assembly` field: it belongs to the assembly of its child body.
- `drives`: what the PLC commands, such as a valve or a contactor (ADR 0022).
  A drive has tags and moves nothing itself; its output ports feed actuators.
- `actuators`: a cylinder or a motor (ADR 0028). It has no tag. It reads the
  ports of one drive (`feed`) and moves the joints it lists (`joints`).
- `sensors`: joint sensors, such as a switch or an encoder (ADR 0023). A
  sensor watches one `joint` and has feedback tags.
- `belts`: a straight conveyor surface, `length` by `width`, driven by a
  continuous joint (`drumJoint`) of radius `drumRadius` (ADR 0043).
- `guides`: a box that products cannot cross (a side rail, an end stop).
- `emitters`: put a box product on the belt when the PLC sets the `spawn`
  tag. The box has a `size`, a `mass` and a `material`.
- `absorbers`: a volume that destroys the products whose centre enters it.
- `presenceSensors`: sensors that look at products with a ray, not at a joint.
  Today the only type is `photoelectric` (ADR 0043 point 8; see
  [adding-a-presence-sensor-type.md](adding-a-presence-sensor-type.md)).

The last five (`belts` to `presenceSensors`) are the "phase 6 objects".
Products themselves are never saved: they exist only while the core runs
(ADR 0043 point 2).

## 2. The ownership rule

Every element says which assembly it is in, by key, and the viewer tree shows
it under that assembly (ADR 0047 point 1). In the document:

- `bodies`, `drives`, `actuators`, `sensors` and the five phase 6 arrays carry
  an `assembly` field (`pantin.ts`, `drive.ts`, `actuator.ts`, `sensor.ts`,
  `pantin-conveyors.ts`, all in `packages/protocol/src`).
- A joint is the one exception: it has no `assembly` field. Its tags use the
  assembly of its child body, and the tree lists it under the bodies it links.
  A joint between bodies of two assemblies is also listed in the folder of
  joints between assemblies, at Pantin level (ADR 0047 point 2).
- An assembly with a `parent` is shown inside that parent.

So "what does this assembly contain" is answered by one filter on
`assembly`, in the file and in the tree. The tree layout and the registry that
builds it are in `packages/viewer/src/tree/device-families.ts`.

## 3. Who references whom

An arrow reads "names one of". Every name is an id or a key.

    assembly --parent--> assembly
    body ------assembly--> assembly
    joint -----parent, child--> body
    drive -----assembly--> assembly
    actuator --assembly--> assembly
             --feed.drive, feed.ports--> drive and its output ports
             --joints--> joint (each joint moved by one actuator at most)
    sensor ----assembly--> assembly
             --joint--> joint (must be movable)
    belt ------drumJoint--> joint (must be continuous)
    belt, guide, emitter, absorber, presenceSensor
             --assembly--> assembly
             --body (optional)--> body, which must be in that assembly

Read together, the arrows give the chain of a conveyor: a drive feeds an
actuator, the actuator moves the drum joint, the belt names that joint
(ADR 0043 point 3).

## 4. Conventions

**Ids and keys.** An id is 1 to 64 lowercase letters, digits or dashes, not at
the ends (`protocol/src/ids.ts`, `SAFE_ID_PATTERN`). It names files and
folders, so it never holds a dot or a slash. A key (`assembly.key`, every
`tagKey`) also allows `_`, so that a tag reads like a PLC variable. In normal
use nobody types them: the core derives them.

- Id from a name: `slugifyDisplayName` (accents removed, lowercase, dashes),
  then `makeUniqueId` adds `-2`, `-3`... if taken (`core/src/domain/ids.ts`).
  A body id comes from the file name without extension (`import-body.ts`).
- A `tagKey` starts from the same slug and must be free among the tag owners of
  its assembly (`core/src/domain/tag-keys.ts`). It changes only when the user
  renames it explicitly (ADR 0019), so renaming an element never breaks a PLC
  program.

**Tags.** `<assembly>.<tagKey>.<member>`, built by `tagName` in
`protocol/src/tag.ts`. Who owns a tag key:

| Owner | Assembly it uses | Members |
| --- | --- | --- |
| joint | that of its child body | `position`, and `setpoint` while no actuator moves it |
| drive | its own | those of its type, such as `run` |
| sensor | its own | those of its type, such as `state` or `count` |
| emitter | its own | `spawn` |
| presence sensor | its own | those of its type, `state` |

Actuators, belts, guides and absorbers have no tag. The core lists every tag
in `core/src/domain/tag-entries.ts`. The PLC mapping (`io.csv`) never
defines a tag; it only links existing tags to variables (section 7).

**Units.** The document is SI: metres, radians, seconds, kilograms. The UI
shows millimetres and degrees. The rule is one place for the conversion,
`packages/viewer/src/units.ts`; two existing exceptions also divide by 1000
(`viewer/src/gizmo/placement-snapping.ts`,
`viewer/src/alignment/alignment-session.ts`). A body's `source.unit` is only
the unit of the imported file. Do not add a third conversion.

**Axes.** Z is up, as in CAD. The viewer converts to Babylon's frame at its
border, nowhere else (CLAUDE.md section 5).

**Rotation.** A `placement` is a `translation` in metres and a unit
quaternion `[x, y, z, w]`; it rotates first, then translates
(`protocol/src/placement.ts`). A quaternion of length other than 1 (within
1e-6) is refused.

**Frame of phase 6 objects (ADR 0043 point 1).** An object is placed by its
`assembly`, an optional `body` and a `placement` relative to that body's
frame, or to the assembly frame without a body. Both frames are the posed
ones, so the object follows its body, or the joints that anchor its assembly.
One shape rule for all: Z points up out of the supporting face and the origin
is the centre of the object's bottom face (the top surface for a belt).

- A belt is `length` along +X by `width` along Y, centred on the origin.
- A guide, an absorber and an emitter box are laid out like a guide: `size`
  is X, Y, Z, centred on the Z axis, bottom face at the origin
  (`core/src/domain/product-absorption.ts` says so for absorbers).
- A presence sensor casts its ray from the origin along +Z of its frame
  (`core/src/domain/presence-step.ts`). To aim it along another axis, rotate
  its frame; the example below turns it to point along -Y.

## 5. Rules beyond JSON Schema

Some rules need to look at several arrays at once, which JSON Schema cannot
express. They live in `superRefine` functions that run after the field
checks, and they exist only in Zod; the exported JSON Schema says so in its
description (`cli/src/json-schema.ts`, ADR 0021 point 2). A file can
therefore pass an editor's schema
check and still be refused by `pantin validate`. The entry point is the last
`superRefine` in `pantin.ts`; each family has its own module.

- `jointTreeIssues` (`pantin.ts`): joints form a forest of bodies. Known
  bodies, no self link, at most one parent joint per body, no cycle.
- Duplicate ids in `bodies` and `joints` (`pantin.ts`); in the other arrays,
  in each module below.
- `pantin-assemblies.ts`: unique assembly keys; every body in a known
  assembly; parents exist and form no loop (ADR 0040); each assembly has at
  most one joint coming from another assembly, and those anchors form no loop
  (ADR 0033); and the tag rule below.
- Unique tag keys: `<assembly>.<tagKey>` names one owner only, across joints,
  drives, sensors, emitters and presence sensors of the same assembly. This
  is why a joint and a drive cannot both be called `lift` in one assembly.
- `pantin-drives.ts`, `pantin-actuators.ts`, `pantin-actuator-feeds.ts`: a
  known assembly; an actuator moves movable joints, each by one actuator at
  most, all in one unit (metres or radians); its feed covers every input port
  of its type from output ports of one existing drive, of the same domain
  (pneumatic, power, servo).
- `pantin-sensors.ts`: a known assembly; the sensor's joint can move; a
  sensor type with a placement rule (limit switch, inductive switch) sits
  where its joint's stroke allows (ADR 0026).
- `pantin-conveyors.ts`: a phase 6 object is in a known assembly; its `body`,
  if any, exists and is in that same assembly; a belt's `drumJoint` is a
  `continuous` joint.

Each issue carries a path (such as `belts.0.body`) and a message that says
what to change.

## 6. Changing the schema, validating a file

**A schema change** (CLAUDE.md section 14.6) is four things in one commit:

1. Edit the Zod schema in `packages/protocol/src`.
2. Raise `PANTIN_SCHEMA_VERSION` and add a line to the comment above it.
3. Add one pure migration, `migrateVNToVN1`, in
   `packages/core/src/domain/migrations.ts`, and register it in
   `MIGRATION_STEPS` under the version it starts from. It takes the parsed JSON
   of the old version and returns the next one; for example
   `migrateV11ToV12` only adds five empty arrays. Larger ones sit in their own
   file (`migrate-drives-actuators.ts`). Write a test for it.
4. Run `pnpm schema:generate` to regenerate
   `packages/protocol/schema/pantin.schema.json`. A test fails when the
   committed file is stale.

The core migrates one version at a time when it reads a file, and saves the
current version on the next write. A file newer than the core is refused with
a message asking to update Pantin.

**Validating a file**:

    pnpm pantin validate path/to/folder

It reads `pantin.json` through the core parser (migration, then the schema and
every rule of section 5), checks that every body's mesh exists inside the
folder, prints one line per problem and exits 1 if there is any. It writes
nothing: a migrated file is reported, not saved (ADR 0021 point 3).

## 7. Where io.csv fits

`io.csv` is not part of `pantin.json`. It sits beside it and maps tag names to
CODESYS variables and Modbus addresses; `io-modules.json` holds the settings
of each Modbus module (ADR 0045 point 6). The document defines the tags, and
`io.csv` only points at them, so a tag is never defined in two places.
`pantin io init` fills it from the document. Renaming a key does not rewrite
`io.csv`: the old row becomes an unknown tag and the new tag is unmapped.

## 8. A minimal example

A belt carries a box from an emitter to an absorber, with a guide and a
photoelectric cell. The chain is a contactor, an AC motor, a continuous joint
(the drum) and the belt. It has the two mesh files `meshes/frame.stl` and
`meshes/drum.stl`.

```json
{
  "schema_version": 12,
  "name": "Belt",
  "assemblies": [
    { "key": "line", "name": "Line", "placement": { "translation": [0, 0, 0], "rotation": [0, 0, 0, 1] } }
  ],
  "bodies": [
    {
      "id": "frame", "name": "Frame", "assembly": "line",
      "source": { "fileName": "frame.stl", "format": "stl", "unit": "mm", "upAxis": "z", "nodes": [] },
      "mesh": "meshes/frame.stl"
    },
    {
      "id": "drum", "name": "Drum", "assembly": "line",
      "source": { "fileName": "drum.stl", "format": "stl", "unit": "mm", "upAxis": "z", "nodes": [] },
      "mesh": "meshes/drum.stl"
    }
  ],
  "joints": [
    {
      "id": "drum-turn", "tagKey": "drum_turn", "type": "continuous", "name": "Drum turn",
      "parent": "frame", "child": "drum", "origin": [0, 0, 0], "axis": [0, 1, 0]
    }
  ],
  "drives": [
    { "id": "contactor", "tagKey": "contactor", "name": "Contactor", "assembly": "line", "type": "contactor" }
  ],
  "actuators": [
    {
      "id": "motor", "name": "Motor", "assembly": "line", "type": "ac_motor", "nominalSpeed": 10,
      "feed": { "drive": "contactor", "ports": { "in": "out" } },
      "joints": ["drum-turn"]
    }
  ],
  "sensors": [
    { "id": "drum-encoder", "tagKey": "drum_encoder", "name": "Drum encoder", "assembly": "line", "joint": "drum-turn", "type": "encoder", "pulsesPerUnit": 100 }
  ],
  "belts": [
    {
      "id": "belt", "name": "Belt", "assembly": "line", "body": "frame",
      "placement": { "translation": [0.5, 0, 0.1], "rotation": [0, 0, 0, 1] },
      "length": 1, "width": 0.3, "drumJoint": "drum-turn", "drumRadius": 0.05
    }
  ],
  "guides": [
    {
      "id": "guide", "name": "Guide", "assembly": "line",
      "placement": { "translation": [0.5, 0.17, 0.1], "rotation": [0, 0, 0, 1] },
      "size": [1, 0.02, 0.1]
    }
  ],
  "emitters": [
    {
      "id": "emitter", "tagKey": "emitter", "name": "Emitter", "assembly": "line",
      "placement": { "translation": [0.1, 0, 0.1], "rotation": [0, 0, 0, 1] },
      "box": { "size": [0.2, 0.2, 0.1], "mass": 1, "material": "cardboard" }
    }
  ],
  "absorbers": [
    {
      "id": "absorber", "name": "Absorber", "assembly": "line",
      "placement": { "translation": [1.1, 0, 0], "rotation": [0, 0, 0, 1] },
      "size": [0.2, 0.4, 0.3]
    }
  ],
  "presenceSensors": [
    {
      "id": "cell", "tagKey": "cell", "name": "Cell", "assembly": "line",
      "placement": { "translation": [0.6, 0.2, 0.15], "rotation": [0.7071067811865476, 0, 0, 0.7071067811865476] },
      "type": "photoelectric", "mode": "diffuse", "range": 0.4, "normallyClosed": false, "onDelay": 0, "offDelay": 0
    }
  ]
}
```

`pnpm pantin validate` accepts this folder. To see the rules work, give the
emitter the tag key `cell`, and point the belt at the body `nobody`; the
validator then prints:

    error: presenceSensors.0.tagKey: Tag key "cell" of presence sensor "cell" is already used in assembly "line".
    error: belts.0.body: Belt "belt" follows body "nobody", which does not exist.

The example is checked against the schema only. Whether the box actually
travels, and the cell switches, with these numbers is NOT VERIFIED (it was not
run in the core).

## Decisions

- [ADR 0011](../decisions/0011-kinematic-joints.md): joints and poses.
- [ADR 0019](../decisions/0019-assemblies-and-tag-prefixes.md): assemblies, keys and tag names.
- [ADR 0021](../decisions/0021-pantin-document-is-the-phase-1-contract.md): the document, its JSON Schema and `pantin validate`.
- [ADR 0022](../decisions/0022-drives-and-drive-type-folders.md), [0028](../decisions/0028-drives-and-actuators.md): drives and actuators.
- [ADR 0023](../decisions/0023-joint-sensors-and-sensor-type-folders.md): joint sensors.
- [ADR 0033](../decisions/0033-assembly-placement.md), [0040](../decisions/0040-nested-assemblies-from-step.md): assembly placement and nesting.
- [ADR 0043](../decisions/0043-products-presence-sensors-and-conveyors.md): phase 6 objects and their frames.
- [ADR 0045](../decisions/0045-plc-bridge-tag-bus-io-mapping-and-modbus-slave.md): `io.csv`.
- [ADR 0047](../decisions/0047-the-tree-shows-the-whole-document.md): the tree shows every element under its assembly.
