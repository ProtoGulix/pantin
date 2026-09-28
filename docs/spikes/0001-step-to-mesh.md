# Spike 0001. STEP to mesh conversion

- Date: 2026-09-28
- Question: can the core turn a STEP assembly into named glTF bodies, with the
  right units, and can a joint be defined on the result?
- Verdict: **feasible** with OpenCascade through the `cadquery-ocp` Python
  wheel. Kernel licence verified on 2026-09-28: LGPL 2.1 with the Open CASCADE
  exception 1.0 (see below).

## Test case

A real part provided by the user, kept in `private/` (git ignored), never
committed: `3630.00.0800N_0.stp`, exported by CADENAS PARTsolutions, STEP AP214,
licence CC BY-ND 4.0 (read from the file header). The licence forbids
distributing derivatives, so no converted mesh is committed; this report only
states measured facts.

The part expected at first (root `ID1S0400125E_0`, bodies `ID1S0400125E_0_1`,
`ID1S0400125E_0_2`, `ID1S040CF-16040_3`, about 280 x 54 x 54 mm) does not
match this file. The user confirmed that `3630.00.0800N_0.stp` is the test
case; the expected values do not apply to it.

## Setup

- Throwaway virtual environment in the session scratch directory, not a
  project dependency: `pip install cadquery-ocp` gave cadquery-ocp 8.0.1.0.0
  (OpenCascade 8.0), Python 3.13, Linux x86_64.
- Install size: 155 MB for `OCP`, plus 639 MB for `vtk`, pulled as a hard
  dependency though unused here.
- The OCP 8 API differs from older pythonocc examples: sequences live in
  `OCP.collections` (`Sequence_TDF_Label`), `Bnd_Box.Get()` is not bound (use
  `CornerMin()`/`CornerMax()`), `TopoDS.Face()` replaces `TopoDS.Face_s()`.

## Results

Read with `STEPCAFControl_Reader` (name mode on) into an XCAF document.

| Item | Measured |
| --- | --- |
| Tree | root assembly `3630.00.0800N_0` with 2 components, 1 solid each |
| Names | `3630.00.0800N_0_1`, `3630.00.0800N_0_2`, kept from the STEP |
| Units | millimetre (`SI_UNIT(.MILLI.,.METRE.)`) |
| Overall size | 1230.0 x 136.0 x 113.0 mm |
| `_1` | 1230.0 x 102.0 x 93.0 mm, placement at origin, long along X |
| `_2` | 333.0 x 136.0 x 98.5 mm, placement translation (-400, 0, 20) mm with a 180° rotation about Y |

### Which part moves

There is no rod: this is not a cylinder but a linear axis. `_1` is the rail
(long profile, axial cylindrical features along X at y, z = ±39 mm). `_2` is
the carriage (tapped holes of radius 3.32 mm on its top face at z = 66.5 mm,
i.e. the customer mounting face). The moving body is therefore `_2`.

### Prismatic joint test

The carriage was translated along X relative to its STEP placement, and the
interference volume with the rail computed with `BRepAlgoAPI_Common`:

| Offset (mm) | Interference (mm³) |
| --- | --- |
| -60 | 20 829 |
| -10 | 643 |
| 0 | 0 |
| 200, 400, 600 | 0 |
| 800 | 0 |
| +810 | 643 |
| +860 | 20 829 |

The free travel is exactly 0 to 800 mm, which matches the `0800` in the part
number. The STEP placement is one end of the stroke. Proposed joint, in core
units (to validate against the schema in phase 1):

    { "id": "stroke", "type": "prismatic", "parent": "rail", "child": "carriage",
      "origin": [-0.400, 0, 0.020], "axis": [1, 0, 0], "limits": [0, 0.800] }

Each interference computation took 90 to 580 ms: fine as an offline check in
the part editor, far too slow for the simulation loop.

### glTF export

`RWGltf_CafWriter` wrote a 1.19 MB GLB:

- Node names are kept (`3630.00.0800N_0`, `_1`, `_2`).
- Coordinates are converted to metres (rail 1.23 x 0.102 x 0.093 m).
- The component placement is kept as a node transform (carriage translation
  [-0.4, 0, 0.02] m and its 180° rotation about Y), so the mesh pivot is the
  body's own frame, not the world origin.
- Axes are **not** converted: the file stays Z up, whereas glTF is Y up by
  specification. The pipeline must pick one convention explicitly (see below).
- One primitive per B-rep face: 400 primitives for the rail, 225 for the
  carriage. Merging primitives per body is needed to keep draw calls low.

## Licence of the OpenCascade kernel

Verified on 2026-09-28 from the official repository
(https://github.com/Open-Cascade-SAS/OCCT, files `LICENSE_LGPL_21.txt` and
`OCCT_LGPL_EXCEPTION.txt`): GNU LGPL version 2.1 with the "Open CASCADE
exception (version 1.0)". The exception lets object code that incorporates
material from OpenCascade header files be distributed "under terms of your
choice, provided that you give prominent notice in supporting documentation
[...] that it makes use of or is based on facilities provided by the Open
CASCADE Technology software". The Python bindings of `cadquery-ocp` are
Apache-2.0 (wheel metadata).

For Pantin (Apache-2.0): using OpenCascade as a separate, unmodified library
installed as a dependency is compatible. Obligations when Pantin distributes
OpenCascade binaries itself: keep them replaceable (LGPL dynamic linking),
ship the LGPL text, give access to the corresponding source, and add the
notice required by the exception in the documentation.

## What remains NOT VERIFIED

- Whether the `cadquery-ocp` wheel ships the OpenCascade libraries unmodified
  and where their corresponding source is published (needed if Pantin ever
  redistributes the wheel, e.g. in a Docker image).
- opencascade.js (WASM, would keep the core in one language) was not tested.
- Behaviour on a STEP from ZW3D (spike 5): this file comes from CADENAS.
- Nested sub-assemblies: this file has only one level.
- Whether the `vtk` dependency can be avoided.

## Consequences for the design

1. STEP conversion runs as an offline CLI/core step (Python sidecar or WASM),
   producing a GLB plus a proposed body list; it is not in the simulation loop.
2. The converter must apply the Z-up to Y-up rotation itself or record the
   up axis in the manifest; otherwise the viewer's single conversion boundary
   (CLAUDE.md section 5) would receive files in mixed conventions.
3. A child body's local frame may be rotated relative to its parent (here 180°
   about Y): a joint axis must be expressed in the parent frame, and the
   schema must say so.
4. The interference check is a useful part editor feature to propose joint
   limits automatically.
