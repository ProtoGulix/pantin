# Split a GLB body by nodes

Left out of ADR 0055 (assemblies as rigid groups), 2026-10-18.

A GLB or STL file is one body: a frame and a rod exported in the same GLB
stay one rigid body, and grouping cannot separate them. A body could get an
optional `drawnNodes` field (glTF node index paths) so that one file gives
several bodies, each drawing its own nodes, without the core writing any
GLB. It needs its own ADR and a schema change. Not needed for the user's
ZW3D to STEP pipeline, where the STEP file already separates the parts.

NOT VERIFIED: that Babylon's glTF loader exposes the glTF node index of each
loaded node; how GLB files exported from Blender or FreeCAD are structured.
