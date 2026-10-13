# 0047. The tree shows the whole document

- Status: accepted
- Date: 2026-10-13
- Partly supersedes: ADR 0030 (point 1: "the tree has no selected row"
  when a device is selected; rejected alternative "Rows for devices in the
  tree")
- Extends: ADR 0019 (assemblies), ADR 0040 (nested assemblies), ADR 0043
  (point 13, viewer)

## Context

After the phase 6 demonstration (ADR 0043 P5), the user noted that belts,
guides, emitters, absorbers and presence sensors appear nowhere in the
tree. They can only be reached by a click in the 3D view, so an object
hidden behind a body is hard to find. The user then set the goal: any
maintainer must understand and adopt the document, so it must be
maintainable and community-minded.

Facts checked in the repository on 2026-10-13:

- The tree (`viewer/src/tree/tree-model.ts`) has rows for the Pantin,
  assemblies, bodies, joints, CAD source nodes and the folder of joints
  between assemblies. One hand-written function per node kind.
- Every other element of the document carries an `assembly` key:
  drives, actuators and sensors (`protocol/src/drive.ts`, `actuator.ts`,
  `sensor.ts`) and the five phase 6 arrays (ADR 0043 point 1). This rule
  is written nowhere a newcomer would read it, and the tree does not show
  it.
- ADR 0030 point 1 made the selection either a tree node or a device
  (`viewer/src/selection.ts`, `device-selection.ts`), and rejected device
  rows in the tree because the tree would repeat the diagram.
- The diagram (ADR 0029) has nodes for drives, actuators and joint
  sensors only. Phase 6 objects are in no chain, so they have no node
  (`device-selection.ts`, `deviceNodeId`).
- The viewer already lists the phase 6 kinds in one place
  (`conveyors/conveyor-kinds.ts`, `CONVEYOR_KINDS` and one reader per
  kind).

The user chose, on 2026-10-13, to put every element in the tree, the
action chain included, knowing that it contradicts ADR 0030, and accepted
this ADR on 2026-10-13.

## Decision

1. **One rule.** Everything in the Pantin document has a row in the tree,
   under the assembly whose key it carries. The tree answers "what does
   this assembly contain"; the diagram keeps answering "how is it wired".
2. **Layout under an assembly**, in this order: sub-assemblies, bodies,
   internal joints (unchanged, ADR 0040), then one folder per family that
   has at least one element in this assembly:

   | Folder | Kinds, in this order |
   | --- | --- |
   | Chaîne d'action / Action chain | drives, actuators, joint sensors |
   | Convoyage / Conveying | belts, guides, presence sensors |
   | Flux de produits / Product flow | emitters, absorbers |

   Inside a folder, elements keep document order within each kind. An
   empty family has no folder. The folder of joints between assemblies
   stays at Pantin level. A family folder's id is
   `family:<pantinId>:<assemblyKey>:<family>`, with `family` one of
   `actionChain`, `conveying`, `productFlow`.
3. **Device rows.** A row shows the kind's icon, the element's name and a
   detail. Drives, actuators, joint sensors and presence sensors show
   their type (for example "Contacteur", "Photoélectrique"). Belts,
   guides, emitters and absorbers have no type: they show their size in
   mm (length × width for a belt, the box for an emitter). A phase 6
   object placed on a body adds that body's name. The row of a joint
   sensor (`sensors`) or presence sensor (`presenceSensors`) whose type
   has a bit `state` tag (the switch types and the photoelectric cell,
   not the encoder) ends with an on or off mark, read from that tag as
   polled today (ADR 0024, ADR 0029 point 8), with the state in words for
   screen readers, like the eye and the bolt.
4. **Selection.** The selection model of ADR 0030 stays one value, a tree
   node or a device. Clicking a device row selects that device, exactly as
   a click in the diagram or the 3D view. When a device is selected, its
   row is the selected row of the tree (this replaces "the tree has no
   selected row" in ADR 0030 point 1). The related joints keep their mark.
   The row id is `device:<pantinId>:<kind>:<id>`, parsed by `node-ids.ts`.
   A device selected from the diagram or the 3D view unfolds its assembly
   and family folder, so that its row is visible.
5. **Actions.** The context menu of a device row offers the actions the
   inspector toolbar already offers for that device. Rename stays in the
   inspector. Device rows cannot be dragged: moving an element to another
   assembly changes its tags and needs its own decision.
6. **A registry, not a function per kind.** The tree reads a list of
   families in `viewer/src/tree/device-families.ts`. Each kind is one
   entry: icon, label key, reader (document to elements), detail and,
   optionally, state. Adding a kind to the document means adding one entry
   here, and a test fails when a `DeviceKind` has no entry.
7. **Labels** in French and English. The viewer computes nothing: the
   state comes from the tags it already reads.
8. **Slices.**
   - P1: registry, rows and folders, selection and keyboard navigation,
     tests (viewer only).
   - P2: state marks and context menu.
   - P3: user demonstration.

## Rejected alternatives

- **Phase 6 objects only, the action chain left to the diagram** (ADR 0030
  as it stands): it keeps the tree short, but the rule becomes "what is
  not in the diagram is in the tree", which a newcomer has to learn.
- **One folder per kind** (eight folders): a small assembly would show
  more folders than elements.
- **Flat rows without folders**: an assembly with a conveyor would mix
  bodies, joints and a dozen devices in one list.
- **Turning devices into tree nodes** (selection by node id only): it
  rewrites the selection model of ADR 0030 for no gain, since a device
  row can carry the device selection as it is.
- **Phase 6 objects under the body they ride on**: the body is optional,
  and an object would move in the tree when its frame changes.

## Consequences

- The tree and the document read the same way: a maintainer who opens
  `pantin.json` finds every array in the tree, under its assembly.
- The tree repeats part of the diagram, the redundancy ADR 0030 removed.
  Accepted by the user for the sake of one rule.
- A long assembly gets longer; folders keep it foldable.
- ADR 0030 gets one line: "Partly superseded by: ADR 0047 (point 1, tree
  rows for devices)".
- Outside this ADR, as agreed with the user on 2026-10-13:
  - a guide `docs/guides/pantin-document.md` that explains the document
    (arrays, references, units, frames, tags, migrations);
  - a guide `docs/guides/adding-a-presence-sensor-type.md`;
  - backlog: the cost of adding a primitive kind (48 non-test files name
    "absorber", case-insensitive grep on 2026-10-13: 6 in protocol, 14 in
    core, 28 in viewer), and two part rules
    for phase 9 (emitters and absorbers belong to the scene rather than a
    part; a belt's drum joint must be inside the part).
- NOT VERIFIED: whether `.describe()` on Zod fields changes the exported
  JSON Schema in a way ADR 0021 treats as a public schema change.
