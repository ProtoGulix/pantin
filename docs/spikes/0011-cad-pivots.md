# Spike 0011. Real CAD files: placements, groups and pivots

- Date: 2026-10-20
- Question (CLAUDE.md section 12, spike 5): can the user's real CAD files give
  correct pivots and groups once imported, and what must the user still do by
  hand to set a pivot?
- Verdict: the **STEP route works** on the real industrial assembly (names,
  nested structure and placements kept, groups created as ADR 0055 point 10
  says, 9 joints instead of 48). A pivot is never guessed from STEP: the user
  sets a slider or pivot by picking a face (ADR 0041) and may reorient a group
  frame (ADR 0056). The route the spike was written for, **glTF exported by the
  CAD software itself, was not tried**: no such file exists on this machine
  and the real CAD software was not run (NOT VERIFIED).
- Supersedes the backlog item `spike-5-cad-pivots-report` (deleted). The
  checks left open are in the backlog item `spike-5b-user-cad-export`.

## Method

Date 2026-10-20, core at the head of `develop` (schema version 13).

- Files in `private/` (git ignored, never named here). Four STEP files, all
  written by a catalogue exporter or a translation framework, not by the
  user's CAD:
  - an industrial saw translator assembly (AP214, Autodesk Translation
    Framework): 72 leaves in the tree, 51 with faces, depth 4;
  - a pneumatic cylinder assembly, 3 bodies, depth 2;
  - a linear axis assembly, 2 bodies, depth 2;
  - a single bearing housing part, 1 body.
  Plus one GLB, see "glTF" below.
- A throwaway core started by hand on a free localhost port (4871), with a
  temporary pantins directory in the session scratch directory and the
  project converter (`--step-converter-python
  packages/step-converter/.venv/bin/python`, as `scripts/docs-screenshots`
  does). Each file was uploaded with `POST /api/pantins/:id/bodies`, then the
  document read with `GET`. Times are wall clock around the upload request, one
  run each, on the development machine.
- The user's own core on 127.0.0.1:4800 was only read with `GET`
  (`/api/pantins/:id`, `/api/pantins/:id/redundant-joints`): nothing written.
- The throwaway core, its data and the scripts were removed afterwards.

## Results: the STEP import

| File | Wall time | Bodies | Assemblies | Joints created | Max node depth |
| --- | --- | --- | --- | --- | --- |
| saw translator assembly | 3.3 s | 51 | 10 | 9, all fixed | 4 |
| pneumatic cylinder | 1.4 s | 3 | 1 | 0 | 2 |
| linear axis | 1.9 s | 2 | 1 | 0 | 2 |
| single part | 0.9 s | 1 | 1 | 0 | 1 |

- **Groups and joints (ADR 0055 point 10).** The translator import gives 10
  assemblies (the root, the carriage plate assembly, 7 sub-assemblies of it,
  and the cylinder) and exactly 9 fixed joints, one per child assembly, each
  holding the child assembly to its parent (or to the parent's first child
  group when the parent has no component of its own, `import-joints.ts`). No
  joint inside an assembly.
  ADR 0055 expected 9: confirmed. Before ADR 0055 the same file gave 48 fixed
  joints; the user's older Pantin `scie`, imported on 2026-10-06, still carries
  them.
- **Structure.** Bodies per assembly: 3, 9, then 11, 3, 10, 3, 3, 3, 3 and 3
  (the bearings carry 11 and 10). The tree of the STEP (assembly, nested
  assembly, bearing) is reproduced as the structure tree; every body keeps its
  full node chain with indices in `source.nodes` (depths 2, 3 and 4 for 3, 12
  and 36 bodies).
- **Names.** Kept verbatim, including the instance suffix (`:1`), spaces and
  parentheses, for assemblies, bodies and joints. Keys and ids are derived
  slugs (a name like `Plate assembly:1` gives `plate-assembly-1`); a
  duplicate gets a numeric suffix. Names are not translated.
- **Face files.** 51 GLB and 51 face files written: the face map was proven
  for every body (no `faceFile: null`). They are what the pivot picking uses.
- **Meshes.** 3.5 MB of GLB for the translator, written in metres, Z up.
- **Placements.** Assembly placements are non identity where the CAD had a
  transform (a rotation by 180 degrees, bearings turned by about 90 degrees);
  48 of 51 bodies carry a placement relative to their assembly, three
  top-level bodies carry none. The root and the single-file imports have the
  identity.
  - Consistency check done: the document of a fresh import equals the user's
    saved Pantin `machine` for every body (placement and assembly: 0
    differences out of 51) and for 8 of 10 assemblies; the root differs
    only by a z offset of 0.2 m, presumably set by the user, and the
    carriage plate assembly by rounding at 1e-11. So the converter output is
    stable between the user's earlier import and today.
  - The user confirmed on screen on 2026-10-18 that the machine shows in place
    (ADR 0056 context). This spike did **not** re-render it or compare it with
    the CAD: whether each body is at the position the CAD gives is checked by
    the user's eyes, not by a measurement here (NOT VERIFIED numerically).

## What the user built (read only, 127.0.0.1:4800)

- `scie` (schema 13, saved 2026-10-06, 51 bodies, 10 assemblies): 49 joints, 48
  fixed and 1 slider (cylinder rod, axis -X of the cylinder frame, 0 to
  0.125 m), a valve and a double acting cylinder. The 48 fixed joints are the
  pre-ADR 0055 import. `GET .../redundant-joints` (ADR 0060) lists 38 as
  redundant and keeps 1 (the rod's own carriage, reason `moving_parent`);
  the 9 others are the joints between assemblies, never candidates. 38 + 1 + 9
  = 48.
- `machine` (51 bodies, 10 assemblies): 9 joints, 8 fixed and 1 slider. The 8
  fixed joints are exactly the import's 9 minus one, the 9th being replaced by
  the slider: the user built the motion as a slider between a body of the root
  assembly and the carriage group, axis [0, 0, -1] in the root frame, range 0
  to 0.125 m, driven by the valve and the cylinder, with two joint sensors
  (up and down). The cylinder stays one rigid group. `GET .../redundant-joints`
  answers 0 redundant and 0 kept: the cleanup is already done.
- No pivot (limited or continuous) exists in either Pantin; the one motion the
  user made is a slider. Nothing in these two Pantins shows a pivot set from a
  STEP file.

## What the user does for a pivot

STEP carries no joint information. The import gives every group its CAD frame
and fixed joints with origin [0, 0, 0] and axis [0, 0, 1]. To make a joint
move the user:

1. changes the joint type and edits the limits;
2. sets origin and axis by typing them, or by "Prendre l'axe sur une face"
   (ADR 0041): one pick on a cylindrical face gives the axis of the shaft or
   bore, on a plane the outward normal; refused for a face of another kind or
   a body without a face file. The axis sign is arbitrary, so the user may have
   to press "Inverser l'axe";
3. optionally reorients the group frame so that its local gizmo follows the
   axis (ADR 0056), without moving a body.

For the machine above the slider axis came out as a pure -Z in the root frame,
so no reorientation was needed. Whether the picking gives the right origin of a
pivot on a real part (a shaft of the saw, a bearing) was not exercised in this
spike (NOT VERIFIED here; ADR 0041 documents it).

## glTF and the other routes

- A GLB exists in `private/`, but it is not an export from the CAD: its
  `asset.generator` is "Open CASCADE Technology 8.0", i.e. an output of the
  project's own converter (spike 0001, 2026-09-28). It has 3 nodes (one root
  named like the assembly, two children), one with a translation and a 180
  degree rotation. It loads with `POST .../bodies` as **one** body in one
  assembly, `upAxis` "y", node names kept in `source.nodes`. A multi node GLB is
  never split (CLAUDE.md section 5), so one file is one body or group, not
  several. This says nothing about what the user's CAD would write.
- **NOT VERIFIED**: glTF or GLB exported natively by the user's CAD (its
  existence on the real version, node names and pivots). **Not tried**: the STL
  path on a real file (no STL in `private/`; STL has no unit or hierarchy, one
  file is one body, CLAUDE.md section 10), another CAD software, a CAD
  assembly with its own joint or mate information (STEP AP214 as written by
  these files carries none; not checked for AP242 kinematics).
- The question in CLAUDE.md section 10 point 4, that the CAD exports STEP and
  STL but not glTF natively, remains from the vendor's format list and was not
  checked on the user's version; the STEP route replaced it in practice
  (ADR 0009, 0040).

## Failures and caveats

- Nothing failed. The first scripted attempt only broke on a missing
  `/usr/bin/time`, a harness issue.
- Single runs: the times are indicative, with no variance measured, a warm
  disk cache and a development machine. The converter limit of 120 s
  (ADR 0009) is far away on this size of assembly; a larger assembly was not
  tried.
- The translator file's STEP header names Autodesk Translation Framework as
  its originating system, not the user's CAD, so naming and frames of the
  user's own exports are NOT VERIFIED, in particular whether that CAD
  exports named sub-assemblies (ADR 0055).

## Needs for a prototype

None: everything used the project's own dependencies. A numeric check of the
placements against the CAD would need a reference file with known positions and
a script reading GLB bounds with numpy, which is not a project dependency.
