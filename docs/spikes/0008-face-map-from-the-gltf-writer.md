# Spike 0008. Face map from the glTF writer

- Date: 2026-10-02
- Question (ADR 0035 point 1): can the converter know, for every triangle
  of a GLB written with merged faces, the B-rep face it comes from, and
  classify that face with an outward normal?
- Verdict: **feasible** on three CADENAS files (6 bodies): the map rebuilt
  from the writer's order matches the GLB exactly, and every plane gets an
  outward normal. **Not yet checked** on a ZW3D export, nor on the clevis of
  Pantin "test" (`ND032a.stp`), whose STEP is not on this machine.

## Sources

- OpenCascade `V8_0_1` (commit `b8f597c`, the version shipped by the pinned
  `cadquery-ocp-novtk==8.0.1.0.0`), read on GitHub:
  `src/DataExchange/TKDEGLTF/RWGltf/RWGltf_CafWriter.cxx`,
  `src/DataExchange/TKRWMesh/RWMesh/RWMesh_FaceIterator.{hxx,cxx}`,
  `RWMesh_ShapeIterator.cxx`.
- Babylon 9.28.0 sources in `node_modules` (see ADR 0035 Context).
- Test files in `private/` (git ignored), all exported by CADENAS
  PARTsolutions, licence CC BY-ND 4.0: `3630.00.0800N_0.stp` (linear axis,
  see spike 0001), `ID1S0400125E_0.stp` (cylinder of Pantins "test2" and
  "test3"), `michaud_chailly_B9-GHBR-20-PP.stp` (single part).
- Throwaway script in the session scratch directory, run with the
  converter's virtual environment and its own modules (`read_step`,
  `find_leaf_components`, `tessellate`); not committed.

## What the writer does (source, 8.0.1)

- For each leaf node kept by the filter, `RWMesh_FaceIterator` walks the
  faces of the node's reference label in `TopExp_Explorer` order, in the
  frame of that label (`TopLoc_Location()`): the node's location goes to the
  glTF node transform.
- With `SetMergeFaces(True)`, `dispatchShapes` groups faces **by style**
  (`XCAFPrs_Style`): one primitive per distinct style, in the order each
  style first appears; inside a primitive, faces keep the walk order (they
  are added to a compound that is walked again when writing). Faces with an
  empty triangulation are skipped (`toSkipShape` is `IsEmpty()`).
- `SetSplitIndices16(True)` would open a new primitive when a group passes
  65535 nodes; false by default, set explicitly by the spike.
- Each face writes its own nodes as one block, no deduplication across
  faces: positions `NodeTransformed`, then the writer's
  `CoordinateSystemConverter` (unit to metres). Indices are
  `TriangleOriented`: the winding is swapped for a reversed face.
- Edges and vertices go through the same dispatch (`RWMesh_EdgeIterator`,
  `RWMesh_VertexIterator`) but only for free edges and points; a solid body
  writes none (both test bodies: no line or point primitive).

## Results

The script exports each body with the converter's settings plus
`SetSplitIndices16(False)`, rebuilds the expected primitives with the same
iterator in Python (group by style, skip empty faces), and compares them to
the GLB: every node position after rounding to 32 bit floats, every
triangle's indices, and the totals.

| Body | Faces | Primitives (styles) | Triangles | Mismatches | Face file | GLB |
| --- | --- | --- | --- | --- | --- | --- |
| rail `_1` | 400 (277 planes, 67 cylinders, 56 other) | 2 | 17 554 | 0 | 38.5 kB | 486 kB |
| carriage `_2` | 225 (131 planes, 36 cylinders, 58 other) | 1 | 16 908 | 0 | 19.6 kB | 444 kB |
| `ID1S0400125E_0_1` | 422 (263 planes, 110 cylinders, 49 other) | 2 | 23 056 | 0 | 41.2 kB | 607 kB |
| `ID1S0400125E_0_2` | 14 (8 planes, 4 cylinders, 2 other) | 1 | 782 | 0 | 1.3 kB | 25 kB |
| `ID1S040CF-16040_3` | 23 (8 planes, 1 cylinder, 14 other) | 1 | 624 | 0 | 1.4 kB | 21 kB |
| `michaud_chailly_B9-GHBR-20-PP` | 15 (10 planes, 5 cylinders) | 1 | 918 | 0 | 1.6 kB | 29 kB |

- The rail has two styles, hence two primitives: grouping by style is real,
  the face file must be indexed by primitive.
- Each face is one contiguous range of triangles (and of nodes) in its
  primitive.
- Outward normal: plane normal from `BRepAdaptor_Surface`, reversed when the
  face is `TopAbs_REVERSED`. Checked on all 697 planes with
  `BRepClass3d_SolidClassifier`: a point 0.01 mm along the normal from a
  triangle centre is OUT, 0.01 mm against it is IN. 697 out of 697.
- Frames: the chain of glTF node transforms of each GLB equals the OCCT
  document node location (unit scaled to metres) to 0 (exact) on all 6
  bodies, carriage 180° rotation included. Face geometry computed in the reference label
  frame and moved by that location is therefore in the frame the mesh file
  places the body in.
- Each GLB references its mesh from one node only, so Babylon creates no
  instance (also true of the clevis GLB of Pantin "test").

## Pitfalls met

- A first outward test gave 100 then 253 wrong planes: it mixed the
  component shape (located by the assembly) with faces from the reference
  label (unlocated), and probed from a face centroid (which can lie off a
  face with holes) or from a mesh node (on an edge). The face file must
  compute all geometry in one frame, the reference label's, then apply the
  node location once.
- `TopoDS.Face_s` does not exist in OCP 8 (`TopoDS.Face`), as noted in
  spike 0001.

## Not verified

- A STEP exported by ZW3D: styles, empty faces, non solid bodies.
- The clevis (`chape-nd032a`, imported from `ND032a.stp`): its GLB is in
  Pantin "test", but not its STEP. ADR 0035 uses the Michaud Chailly
  bearing block for its exit criterion instead (two holes 40 mm apart,
  like the carriage's tapped holes at y = ±20 mm).
- A body above 65535 nodes per primitive (largest here: 17 910 nodes,
  16 bit indices). The source picks 32 bit indices when a primitive has
  more than 65535 nodes and, with `SetSplitIndices16(False)`, never splits;
  not run on such a body.
- `BRepClass3d_SolidClassifier` on a body that is not a closed solid.
