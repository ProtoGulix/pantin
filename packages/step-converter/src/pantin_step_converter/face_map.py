"""Maps each triangle of a written GLB to the B-rep face it comes from (ADR 0035).

`RWGltf_CafWriter` with merged faces writes one primitive per face style, and
in each primitive the faces in the order `RWMesh_FaceIterator` walks them,
each face with its own block of nodes (spike 0008, OpenCascade 8.0.1). The map
is rebuilt by walking the faces the same way, then proven against the GLB:
every node position and every triangle must match, or there is no map.
"""

from array import array
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from OCP.collections import Sequence_TDF_Label
from OCP.RWMesh import RWMesh_CoordinateSystemConverter, RWMesh_FaceIterator
from OCP.TDocStd import TDocStd_Document
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS_Face
from OCP.XCAFPrs import (
    XCAFPrs_DocumentExplorer,
    XCAFPrs_DocumentExplorerFlags_OnlyLeafNodes,
    XCAFPrs_DocumentNode,
    XCAFPrs_Style,
)

from pantin_step_converter.assembly import LeafComponent
from pantin_step_converter.errors import ConverterError, FaceMapMismatchError
from pantin_step_converter.face_geometry import FaceGeometry, describe_face
from pantin_step_converter.glb_file import GlbContent, read_accessor, read_glb
from pantin_step_converter.ocp_helpers import is_closed_solid

FACE_FILE_FORMAT_VERSION = 1


@dataclass(frozen=True)
class FaceRange:
    first_triangle: int
    triangle_count: int
    face_index: int


@dataclass(frozen=True)
class PrimitiveFaces:
    mesh: int
    primitive: int
    ranges: tuple[FaceRange, ...]


@dataclass(frozen=True)
class FaceFile:
    """Geometry in metres, in the frame where the GLB places the body."""

    # Every face bounds a solid, so plane normals point out of the material.
    solid: bool
    primitives: tuple[PrimitiveFaces, ...]
    faces: tuple[FaceGeometry, ...]

    def to_json(self, writer: str) -> dict[str, object]:
        return {
            "formatVersion": FACE_FILE_FORMAT_VERSION,
            "writer": writer,
            "solid": self.solid,
            "primitives": [
                {
                    "mesh": primitive.mesh,
                    "primitive": primitive.primitive,
                    "ranges": [
                        [
                            face_range.first_triangle,
                            face_range.triangle_count,
                            face_range.face_index,
                        ]
                        for face_range in primitive.ranges
                    ],
                }
                for primitive in self.primitives
            ],
            "faces": [face.to_json() for face in self.faces],
        }


@dataclass(frozen=True)
class _WrittenFace:
    face: TopoDS_Face
    # Node coordinates as the writer stores them: converted, then 32 bit floats.
    positions: tuple[float, ...]
    # Corner indices relative to the face's first node, winding as written.
    corners: tuple[int, ...]


def build_face_file(
    document: TDocStd_Document,
    component: LeafComponent,
    glb_path: Path,
    converter: RWMesh_CoordinateSystemConverter,
    metres_per_unit: float,
) -> FaceFile:
    """Raises FaceMapMismatchError when the GLB is not what the walk predicts."""
    node = _document_node(document, component)
    groups = _faces_by_style(node, converter)
    try:
        content = read_glb(glb_path)
    except ConverterError as error:
        raise FaceMapMismatchError(str(error)) from error
    primitives = _primitives_of_the_mesh(content)
    if len(primitives) != len(groups):
        raise FaceMapMismatchError(
            f"{len(primitives)} primitives written for {len(groups)} face styles."
        )
    placement = node.Location.Transformation()
    faces: list[FaceGeometry] = []
    mapped: list[PrimitiveFaces] = []
    for (mesh_index, primitive_index, primitive), group in zip(primitives, groups, strict=True):
        ranges = _check_primitive(content, primitive, group, first_face_index=len(faces))
        mapped.append(PrimitiveFaces(mesh_index, primitive_index, ranges))
        faces.extend(describe_face(written.face, placement, metres_per_unit) for written in group)
    return FaceFile(is_closed_solid(component.shape), tuple(mapped), tuple(faces))


def _document_node(document: TDocStd_Document, component: LeafComponent) -> XCAFPrs_DocumentNode:
    roots = Sequence_TDF_Label()
    roots.Append(component.root_label)
    explorer = XCAFPrs_DocumentExplorer(
        document, roots, XCAFPrs_DocumentExplorerFlags_OnlyLeafNodes
    )
    wanted_id = component.explorer_ids[-1]
    while explorer.More():
        node = explorer.Current()
        if node.Id.ToCString() == wanted_id:
            return node
        explorer.Next()
    raise FaceMapMismatchError(f"No document node {wanted_id} for {component.name}.")


def _faces_by_style(
    node: XCAFPrs_DocumentNode, converter: RWMesh_CoordinateSystemConverter
) -> list[list[_WrittenFace]]:
    """The faces of each future primitive, walked like `RWGltf_CafWriter::dispatchShapes`."""
    styles: list[XCAFPrs_Style] = []
    groups: list[list[_WrittenFace]] = []
    iterator = RWMesh_FaceIterator(node.RefLabel, TopLoc_Location(), True, node.Style)
    while iterator.More():
        if not iterator.IsEmpty():
            style = iterator.Style()
            group_index = next(
                (index for index, known in enumerate(styles) if known.IsEqual(style)), None
            )
            if group_index is None:
                styles.append(style)
                groups.append([])
                group_index = len(groups) - 1
            groups[group_index].append(_written_face(iterator, converter))
        iterator.Next()
    return groups


def _written_face(
    iterator: RWMesh_FaceIterator, converter: RWMesh_CoordinateSystemConverter
) -> _WrittenFace:
    coordinates: list[float] = []
    for node_index in range(iterator.NodeLower(), iterator.NodeUpper() + 1):
        position = iterator.NodeTransformed(node_index).XYZ()
        converter.TransformPosition(position)
        coordinates.extend((position.X(), position.Y(), position.Z()))
    corners: list[int] = []
    for element_index in range(iterator.ElemLower(), iterator.ElemUpper() + 1):
        triangle = iterator.TriangleOriented(element_index)
        corners.extend(triangle.Value(corner) - iterator.NodeLower() for corner in (1, 2, 3))
    positions = tuple(array("f", coordinates).tolist())
    return _WrittenFace(iterator.Face(), positions, tuple(corners))


def _primitives_of_the_mesh(content: GlbContent) -> list[tuple[int, int, dict[str, Any]]]:
    nodes = content.gltf.get("nodes", [])
    if not isinstance(nodes, list):
        raise FaceMapMismatchError("The GLB has no list of nodes.")
    mesh_indices = [node["mesh"] for node in nodes if isinstance(node, dict) and "mesh" in node]
    if len(mesh_indices) != 1:
        raise FaceMapMismatchError(f"{len(mesh_indices)} nodes carry a mesh, expected 1.")
    mesh_index = mesh_indices[0]
    try:
        primitives = content.gltf["meshes"][mesh_index]["primitives"]
    except (KeyError, IndexError, TypeError) as error:
        raise FaceMapMismatchError(f"Mesh {mesh_index} is not described.") from error
    if not isinstance(primitives, list) or not all(
        isinstance(primitive, dict) for primitive in primitives
    ):
        raise FaceMapMismatchError(f"Mesh {mesh_index} has no list of primitives.")
    return [(mesh_index, index, primitive) for index, primitive in enumerate(primitives)]


def _check_primitive(
    content: GlbContent,
    primitive: dict[str, Any],
    group: list[_WrittenFace],
    first_face_index: int,
) -> tuple[FaceRange, ...]:
    attributes = primitive.get("attributes")
    if (
        "indices" not in primitive
        or not isinstance(attributes, dict)
        or "POSITION" not in attributes
    ):
        raise FaceMapMismatchError("A primitive has no indexed positions.")
    try:
        positions = read_accessor(content, attributes["POSITION"])
        indices = read_accessor(content, primitive["indices"])
    except ConverterError as error:
        raise FaceMapMismatchError(str(error)) from error
    ranges: list[FaceRange] = []
    first_coordinate = 0
    first_corner = 0
    for offset, written in enumerate(group):
        face_index = first_face_index + offset
        end_coordinate = first_coordinate + len(written.positions)
        if positions[first_coordinate:end_coordinate] != written.positions:
            raise FaceMapMismatchError(f"Node positions of face {face_index} differ.")
        first_node = first_coordinate // 3
        end_corner = first_corner + len(written.corners)
        expected = tuple(corner + first_node for corner in written.corners)
        if indices[first_corner:end_corner] != expected:
            raise FaceMapMismatchError(f"Triangles of face {face_index} differ.")
        ranges.append(FaceRange(first_corner // 3, len(written.corners) // 3, face_index))
        first_coordinate = end_coordinate
        first_corner = end_corner
    if first_coordinate != len(positions) or first_corner != len(indices):
        raise FaceMapMismatchError("A primitive holds more than its faces.")
    return tuple(ranges)
