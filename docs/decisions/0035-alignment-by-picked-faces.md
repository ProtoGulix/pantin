# 0035. Alignment by picked faces

- Status: proposed
- Date: 2026-10-02
- Depends on: ADR 0033 (assembly placement), ADR 0034 (placement editing)
- Extends: ADR 0009 (STEP import converter)

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

NOT VERIFIED:

- whether the converter already merges primitives per body (ADR 0009), in
  which case the triangle to face mapping must be kept before merging;
- the OpenCascade calls that classify faces and give their geometry
  (`BRepAdaptor_Surface` and its surface type are expected), and how face
  orientation must be read to get an outward normal;
- the behaviour on a STEP from ZW3D (spike 5); spike 0001 used a CADENAS
  file.

## Decision

1. **Spike first.** A spike on the user's real files (the CADENAS axis and a
   ZW3D export) checks the three points above and the size of the metadata
   on the largest body. This ADR moves to accepted only after it.
2. **Face metadata.** For each STEP body, the converter writes a sidecar
   file next to its GLB (`meshes/<body>.faces.json`, schema in the
   protocol): for each triangle range, its face index; for each face, its
   kind and geometry in the body frame: plane (centroid, outward normal),
   cylinder (a point on the axis, direction, radius, axial extent), other
   (no geometry). STL and GLB bodies have no sidecar.
3. **Picking.** In alignment mode, the viewer maps a picked triangle to its
   face through the sidecar and highlights the whole face. Without a
   sidecar, a pick gives a plane from the triangle's normal and the hit
   point; no axis can be picked.
4. **Connector frames.** A picked plane gives a frame at its centroid, Z
   along its outward normal. A picked cylinder gives a frame on its axis at
   mid extent, Z along the axis.
5. **Alignments.** Two kinds: "plan sur plan" (the frames coincide, normals
   opposite) and "axe sur axe" (axes coincide, frame origins coincide).
   Parameters: flip, offset along Z in millimetres, rotation about Z in
   degrees. The first pick belongs to the assembly that moves; the second
   must belong to another assembly.
6. **Computed by the core.** The viewer sends
   `POST .../assemblies/:assemblyKey/align` with both picks (body and face
   index, or the plane of a fallback pick), the kind and the parameters. The
   core reads the sidecars, computes the placement in the moving assembly's
   anchor frame, and writes it through the same rules as ADR 0033 point 8.
   The computation is a pure function, tested without a viewer. Joint
   displacements at the time of the request are taken into account, so that
   an alignment made with the carriage at mid stroke is correct at rest.
7. **Nothing persistent.** Only the resulting placement is stored. No mate,
   no face reference in `pantin.json`.
8. **Fixed joint shortcut.** The alignment dialog offers "Créer une liaison
   fixe" between the two picked bodies; it chains the existing joint
   creation request after the alignment. Creation then re-anchors the
   moving assembly without moving it (ADR 0033 point 6).

## Rejected alternatives

- Computing the alignment in the viewer: geometry the core must be able to
  test and to serve to the CLI.
- Storing the face references with the placement, to re-edit an alignment:
  face indices change when a part is imported again, leaving references
  that point to another face without any error. Backlog, with a stable face
  identity.
- Fitting planes and cylinders on the mesh in the viewer: approximate where
  the B-rep gives exact geometry for free.
- More alignment kinds (distance between faces, angle, tangency): two kinds
  cover mounting a part on a face and on a pin; others go to backlog until
  a real case needs them.

## Consequences

- The converter gains face classification and a sidecar per body; the
  import moves sidecars with GLBs (ADR 0009 point 6).
- Pantins imported before this ADR have no sidecars: the viewer offers to
  re-import the STEP, or uses the fallback pick.
- Exit criterion: on the user's files, the clevis is placed on the carriage
  mounting face with two picks, and the placement differs from the value
  computed from the STEP geometry by less than 0.01 mm.
