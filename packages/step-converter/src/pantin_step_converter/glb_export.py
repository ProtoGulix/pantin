"""Tessellates shapes and writes one component of an XCAF document as a binary glTF file."""

from pathlib import Path

from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.collections import (
    IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString,
    Map_TCollection_AsciiString,
    Sequence_TDF_Label,
)
from OCP.Message import Message_ProgressRange
from OCP.RWGltf import RWGltf_CafWriter
from OCP.TCollection import TCollection_AsciiString
from OCP.TDocStd import TDocStd_Document
from OCP.TopoDS import TopoDS_Shape

from pantin_step_converter.assembly import LeafComponent
from pantin_step_converter.errors import ConverterError
from pantin_step_converter.glb_materials import apply_cad_material_defaults

# Tessellation tolerances measured as good enough on a real part in spike 0001:
# 0.2 mm chordal error, 0.3 rad (about 17 degrees) between adjacent facets.
LINEAR_DEFLECTION_METRES = 0.0002
ANGULAR_DEFLECTION_RADIANS = 0.3


def tessellate(shape: TopoDS_Shape, document_unit_in_metres: float) -> None:
    """Store a triangulation in the shape, which the glTF writer requires."""
    linear_deflection = LINEAR_DEFLECTION_METRES / document_unit_in_metres
    BRepMesh_IncrementalMesh(shape, linear_deflection, False, ANGULAR_DEFLECTION_RADIANS, True)


def export_component_glb(
    document: TDocStd_Document, component: LeafComponent, output_path: Path
) -> None:
    """Write the component with its ancestors, so that its placement stays a node transform.

    The writer converts lengths from the document unit to metres (glTF unit). It
    keeps the CAD axes (Z up) because no input coordinate system is set: the
    core records the up axis instead of rotating the mesh.
    """
    roots = Sequence_TDF_Label()
    roots.Append(component.root_label)
    # The filter lists every node to write, from the root down to the component;
    # the other components of the assembly are skipped.
    node_filter = Map_TCollection_AsciiString()
    for explorer_id in component.explorer_ids:
        node_filter.Add(TCollection_AsciiString(explorer_id))

    writer = RWGltf_CafWriter(TCollection_AsciiString(str(output_path)), True)
    # One primitive per B-rep face would mean hundreds of draw calls per body.
    writer.SetMergeFaces(True)
    written = writer.Perform(
        document,
        roots,
        node_filter,
        IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString(),
        Message_ProgressRange(),
    )
    if not written or not output_path.is_file():
        raise ConverterError(f"OpenCascade could not write {output_path.name}.")
    apply_cad_material_defaults(output_path)
