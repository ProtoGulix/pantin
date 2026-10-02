# 0035. Alignment by picked faces

- Status: proposed
- Date: 2026-10-02
- Depends on: ADR 0033 (assembly placement), ADR 0034 (placement editing)
- Extends: ADR 0009 (STEP import converter), ADR 0019 point 13 (selection
  in 3D)

## Context

Typing a placement or dragging a gizmo cannot put a clevis exactly on a
carriage face, or a pin exactly in a bore, without reading dimensions in the
CAD. CAD systems do it with mates; ADR 0033 rejects persistent mates and a
solver. A one shot alignment, computed once and stored as a placement, gives
the same result for a forest.

Spike 0001 measured that the OpenCascade export writes one glTF primitive
per B-rep face (400 for the rail, 225 for the carriage) and that merging
primitives per body is needed to keep draw calls low. The converter
therefore knows, for every triangle, the B-rep face it comes from, and can
classify each face (plane, cylinder) with its geometry.

Checked on 2026-10-02:

- The converter merges the faces of a body in the writer
  (`writer.SetMergeFaces(True)` in `glb_export.py`), so the triangle to
  face mapping is lost in the written GLB.
- The converter pins `cadquery-ocp-novtk==8.0.1.0.0`, which ships
  OpenCascade 8.0.1 (`libTKRWMesh...so.8.0.1`). Its binding exposes
  `SetSplitIndices16` (default false), `CoordinateSystemConverter`,
  `RWMesh_FaceIterator` and `RWMesh_ShapeIterator`, `BRepAdaptor_Surface`
  and `BRep_Tool.Triangulation_s`. No OpenCascade source or header is in the
  virtual environment.
- The viewer (Babylon 9.28.0) already picks bodies with `scene.pick`
  (`pickBody` in `packages/viewer/src/scene/viewport.ts`, ADR 0019
  point 13). It does not merge meshes: no `MergeMeshes`, instance, sub mesh
  or thin instance in `packages/viewer/src`.
- In the Babylon 9.28.0 sources: the glTF loader makes one Babylon mesh per
  primitive (`<name>_primitive<i>`) when a glTF mesh has several, tags each
  with its glTF pointer (`_internalMetadata.gltf.pointers`,
  `/meshes/<m>/primitives/<p>`), and makes instances when several nodes
  share a glTF mesh (`createInstances`, true by default).
  `PickingInfo.faceId` is the triangle index in the whole index buffer of
  the picked mesh (sub mesh face id plus `indexStart / 3`).

NOT VERIFIED:

- How `RWGltf_CafWriter` 8.0.1 groups merged faces into primitives (by
  style, through `RWGltf_StyledShape` or otherwise) and in which order it
  walks them (the iteration changed in 7.9 with `RWMesh_ShapeIterator`).
  It has to be read in the 8.0.1 source.
- Whether the writer keeps the triangle order and winding of each face's
  `Poly_Triangulation`, and how it handles reversed faces.
- How face orientation must be read to get an outward normal (a reversed
  face flips the surface normal is expected), and what "outward" means for a
  body that is not a closed solid.
- The behaviour on a STEP from ZW3D (spike 5); spike 0001 used a CADENAS
  file.
- That a Babylon pick on an `InstancedMesh` gives a `faceId` in its source
  mesh's index buffer (expected, since an instance shares the geometry).

## Decision

1. **Spike first.** A spike on the user's real files (the CADENAS axis and a
   ZW3D export) settles the points marked NOT VERIFIED and measures the size
   of the face file on the largest body. This ADR moves to accepted only
   after it. For the writer:
   - the OpenCascade version stays pinned by the converter's dependency, and
     the face file records it; a version change reruns the control of
     point 2;
   - the converter sets `SetSplitIndices16(False)` explicitly instead of
     relying on the default, so a primitive is never split by index count;
   - the primitive grouping and the face order are read in the source of the
     pinned version, not guessed.
2. **Face file.** For each STEP body, the converter writes a file next to its
   GLB (`meshes/<body>.faces.json`, schema in the protocol). It walks the
   faces in the writer's order and, for each primitive (glTF mesh and
   primitive index), lists triangle ranges and the face index of each range.
   For each face: its kind and its geometry: plane (a point, outward
   normal), cylinder (a point on the axis, direction, radius), other (no
   geometry). Geometry is in metres, in the frame where the mesh file places
   the body (after the GLB node transforms), which is the assembly frame of
   ADR 0033 point 1; the core composes it with the body placement
   (ADR 0033 point 7) when there is one. The file says whether the body is
   a closed solid; on a body that is not, normals keep the face orientation
   and only flip can correct them.

   **Control.** Before writing the file, the converter compares, for every
   range, the vertices of the primitive with those of the face's
   `BRep_Tool::Triangulation`, passed through the face location and the
   writer's `CoordinateSystemConverter`. They must be equal after rounding to
   32 bit floats, on every range of every primitive. Otherwise the body gets
   no face file and the import says so. This catches a range shifted between
   two coplanar faces, which a "point on the surface" test would miss, and
   covers faces of kind other.

   STL and GLB bodies have no face file.
3. **Picking.** Alignment mode reuses the existing pick (ADR 0019
   point 13). The viewer maps the picked Babylon mesh to its glTF primitive
   through the loader's glTF pointer, then `faceId` to a range of the face
   file, and highlights the whole face. Without a face file, a pick gives a
   plane from the triangle's normal and the hit point; no axis can be
   picked. The request carries the hit point, in metres in the Pantin frame
   as displayed; the core takes it to the body frame with the displacements
   it holds.
4. **Connector frames.** A frame is an origin and a Z direction; no X axis is
   needed, because every rotation below is defined without one.
   - Plane: origin at the hit point projected on the plane, Z along the
     outward normal.
   - Cylinder: origin at the hit point projected on the axis, Z along the
     axis direction.
5. **Alignments.** The first pick belongs to the assembly that moves (frame
   `o_m`, `z_m`), the second to the target (`o_t`, `z_t`). Parameters: flip,
   offset in millimetres, rotation `θ` in degrees. Each alignment moves the
   whole moving assembly by one rigid motion, applied in three steps:
   1. a minimal rotation about `o_m` taking `z_m` to the wanted direction;
   2. a translation;
   3. a rotation by `θ` about the line through the moved `o_m` along `z_t`.

   - **"Plan sur plan"**: wanted direction `-z_t` (flip: `+z_t`).
     Translation along `z_t` only, so that the moving plane sits at the
     offset from the target plane (positive is a gap). The moving origin
     keeps its position in the plane: nothing is centred.
   - **"Axe sur axe"**: wanted direction `s·z_t`, with `s` the sign of
     `z_m · z_t` (`+1` when zero), and flip negates `s`. The arbitrary sign
     of a B-rep axis therefore never turns a part over by default. The
     translation is the component of `o_t - o_m` perpendicular to `z_t`, plus
     the offset along `z_t`: the axial position is kept.
   - **"Axe sur axe autour d'un pivot"**: three picks, a pivot cylinder on
     the target (a hole already aligned, axis `p`, `z`), a hole on the
     moving part and a hole on the target (points `q_m`, `q_t` on their
     axes). The motion is only a rotation about the pivot axis, by the
     signed angle about `z` from the component of `q_m - p` perpendicular
     to `z` to that of `q_t - p`, plus `θ`. There is no minimal rotation and
     no translation; flip and offset do not apply. Refused (`400`) when the
     three axes are not parallel (within `ε`), or when a hole axis lies on
     the pivot axis.

   **Minimal rotation.** From `a` to `b` (unit vectors): identity when
   `a · b ≥ 1 - ε`. When `a · b ≤ -1 + ε` the axis is not unique: the core
   turns 180° about `normalize(a × e)`, where `e` is the Pantin frame axis
   with the smallest `|a · e|`, ties broken in the order X, Y, Z. Otherwise
   the axis is `normalize(a × b)`. `ε` is a named constant of the pure
   function; the antiparallel case, the tie break and the near-identity case
   are tested.

   **Sequences.** Each alignment can undo the previous one: nothing is kept
   between them (point 7). Only "plan sur plan" followed by "axe sur axe" is
   guaranteed to keep the first result, and only when the axis is
   perpendicular to the contact plane (within `ε`). Then the minimal
   rotation is the identity, the translation lies in the plane, and `θ`
   turns about the plane normal. After that sequence one degree of freedom
   is left: the rotation about the axis. `θ` covers patterns whose angle is
   known (a square pattern of holes: a multiple of 90°); "axe sur axe
   autour d'un pivot", with the first hole as pivot, aligns a second hole of
   any pattern and keeps the plane contact and the first hole in place.
6. **Computed by the core.** The viewer sends
   `POST .../assemblies/:assemblyKey/align` with the picks (body,
   primitive, face index and hit point, or the plane of a fallback pick;
   three for the pivot kind, whose pivot and target hole must be on the
   same side),
   the kind and the parameters. The core reads the face files, computes the
   rigid motion in the configuration on screen (current joint
   displacements), and writes the placement that gives the moving assembly
   that motion, through the same rules as ADR 0033 point 8. The computation
   is a pure function, tested without a viewer.
   - The alignment holds when the target moves only if the moving assembly
     follows it: it is anchored below the target body, or a fixed joint is
     created afterwards (point 8). Otherwise an alignment made with the
     carriage at mid stroke leaves the clevis where the carriage was, and
     the dialog says so when the target body is displaced by a joint.
   - Refused (`conflict`): a target body in the moving assembly or in an
     assembly anchored, directly or not, to the moving assembly, since
     moving one moves the other. An axis kind with a fallback pick (`400`).
   - With the clock running, the target may move between the display and the
     request; the core uses its pose at the request. The dialog suggests
     pausing the clock (ADR 0032).
7. **Nothing persistent.** Only the resulting placement is stored. No mate,
   no face reference in `pantin.json`.
8. **Fixed joint shortcut.** The alignment dialog offers "Créer une liaison
   fixe" between the two picked bodies; it chains the existing joint
   creation request after the alignment. Since creation keeps the pose on
   screen (ADR 0033 point 6), the alignment then holds at every position of
   the target. The option is disabled, with the joint already in place named,
   when the moving assembly already has an anchor (ADR 0033 point 2).

## Rejected alternatives

- Computing the alignment in the viewer: geometry the core must be able to
  test and to serve to the CLI.
- Storing the face references with the placement, to re-edit an alignment:
  face indices change when a part is imported again, leaving references
  that point to another face without any error. Backlog, with a stable face
  identity.
- Fitting planes and cylinders on the mesh in the viewer: approximate where
  the B-rep gives exact geometry for free.
- Making the frame origins coincide (face centroids, cylinder mid extent):
  centres a part on a face it is not meant to be centred on, and makes
  "axe sur axe" pull a part down to mid depth of a hole, breaking a contact
  made by a previous "plan sur plan".
- Frames with an X axis taken from the face parametrisation: arbitrary from
  one CAD to another, and not needed once rotations are minimal.
- Undoing the writer's merge and merging faces in the converter: more code
  than the control of point 2, which makes the writer's order safe to rely
  on.
- More alignment kinds (distance between faces, angle, tangency): three
  kinds cover mounting a part on a face, on a pin and on a hole pattern;
  others go to backlog until a real case needs them.

## Consequences

- The converter gains face classification, a face file per body and its
  control; the import moves face files with GLBs (ADR 0009 point 6).
- The viewer adds a face highlight (a sub range of a body's triangles) and
  maps picks through `_internalMetadata.gltf.pointers`, an internal Babylon
  field: a Babylon upgrade must rerun the test that covers it.
- Pantins imported before this ADR, and STEP bodies whose control failed,
  have no face file: only the fallback pick works on them. Pantin has no
  route to import a body again in place (only `POST .../bodies`, which adds
  bodies); such a route is backlog.
- Exit criterion: on the user's files, the clevis is mounted on the carriage
  with "plan sur plan" (clevis mounting face on carriage mounting face) then
  "axe sur axe" (a clevis hole on a tapped hole of the carriage), then "axe
  sur axe autour d'un pivot" (a second hole, the first as pivot). Measured
  by the core from the face files and the resulting poses: distance between
  the two contact planes below 0.01 mm, and distance between the axes of
  each pair of holes, at the contact plane, below 0.01 mm.
