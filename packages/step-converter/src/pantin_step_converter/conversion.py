"""Converts a STEP file into one GLB per leaf component and describes the result."""

import json
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path

from OCP.gp import gp_Quaternion, gp_Trsf
from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID

from pantin_step_converter.assembly import LeafComponent, SourceNode, find_leaf_components
from pantin_step_converter.errors import (
    ConverterError,
    FaceMapMismatchError,
    UnusableStepFileError,
)
from pantin_step_converter.face_map import build_face_file
from pantin_step_converter.glb_export import export_component_glb, tessellate
from pantin_step_converter.ocp_helpers import count_subshapes
from pantin_step_converter.step_reader import StepDocument, read_step

_SCALE_TOLERANCE = 1e-9

# The OpenCascade binding that wrote the GLB: the face map relies on its writer.
_WRITER = f"cadquery-ocp-novtk {version('cadquery-ocp-novtk')}"


@dataclass(frozen=True)
class ConvertedComponent:
    file: str
    name: str
    nodes: tuple[SourceNode, ...]
    # Exactly one is set: the face file (ADR 0035), or the reason it could not be built.
    face_file: str | None
    face_file_problem: str | None


@dataclass(frozen=True)
class AssemblyNodePlacement:
    """Location of a root or assembly node relative to its parent node (metres, unit quaternion)."""

    path: tuple[int, ...]
    translation: tuple[float, float, float]
    rotation: tuple[float, float, float, float]


@dataclass(frozen=True)
class ConversionResult:
    source_unit: str
    assembly_nodes: tuple[AssemblyNodePlacement, ...]
    components: tuple[ConvertedComponent, ...]

    def to_json(self) -> dict[str, object]:
        """The stdout object of the process contract (ADR 0009)."""
        return {
            "sourceUnit": self.source_unit,
            "assemblyNodes": [
                {
                    "path": list(node.path),
                    "translation": list(node.translation),
                    "rotation": list(node.rotation),
                }
                for node in self.assembly_nodes
            ],
            "components": [
                {
                    "file": component.file,
                    "faceFile": component.face_file,
                    "name": component.name,
                    "nodes": [
                        {"name": node.name, "path": list(node.path)} for node in component.nodes
                    ],
                }
                for component in self.components
            ],
        }


def convert_step(input_path: Path, output_dir: Path) -> ConversionResult:
    if not output_dir.is_dir():
        raise ConverterError(f"The output directory {output_dir} does not exist.")
    step = read_step(input_path)
    components = _visible_components(find_leaf_components(step.document))
    # Before any GLB is written: a scaled or mirrored instance fails fast.
    assembly_nodes = assembly_node_placements(components, step.document_unit_in_metres)

    converted = tuple(
        _convert_component(step, component, output_dir, index)
        for index, component in enumerate(components)
    )
    return ConversionResult(
        source_unit=step.source_unit,
        assembly_nodes=assembly_nodes,
        components=converted,
    )


def assembly_node_placements(
    components: list[LeafComponent], document_unit_in_metres: float
) -> tuple[AssemblyNodePlacement, ...]:
    """Locations of the roots and assembly nodes above the kept components.

    The meshes are written in the frame of the STEP root, Z up; the locations
    are in that same frame, translations in metres.
    """
    placements: dict[tuple[int, ...], AssemblyNodePlacement] = {}
    for component in components:
        # The last node is the leaf itself: leaves are not listed.
        for node, location in zip(component.nodes[:-1], component.locations[:-1], strict=True):
            if node.path not in placements:
                placements[node.path] = _placement(
                    node, location.Transformation(), document_unit_in_metres
                )
    return tuple(placements.values())


def _placement(
    node: SourceNode, transform: gp_Trsf, document_unit_in_metres: float
) -> AssemblyNodePlacement:
    if transform.IsNegative() or abs(transform.ScaleFactor() - 1.0) > _SCALE_TOLERANCE:
        raise UnusableStepFileError(
            f'The assembly "{node.name}" is placed with a scale or a mirror, '
            "which Pantin cannot represent. Export the model without scaled or mirrored instances."
        )
    translation = transform.TranslationPart()
    quaternion = transform.GetRotation()
    return AssemblyNodePlacement(
        path=node.path,
        translation=(
            translation.X() * document_unit_in_metres,
            translation.Y() * document_unit_in_metres,
            translation.Z() * document_unit_in_metres,
        ),
        rotation=_quaternion_components(quaternion),
    )


def _quaternion_components(quaternion: gp_Quaternion) -> tuple[float, float, float, float]:
    return (quaternion.X(), quaternion.Y(), quaternion.Z(), quaternion.W())


def _convert_component(
    step: StepDocument, component: LeafComponent, output_dir: Path, index: int
) -> ConvertedComponent:
    glb_name = f"{index}.glb"
    face_file_name = f"{index}.faces.json"
    tessellate(component.shape, step.document_unit_in_metres)
    converter = export_component_glb(step.document, component, output_dir / glb_name)
    try:
        face_file = build_face_file(
            step.document,
            component,
            output_dir / glb_name,
            converter,
            step.document_unit_in_metres,
        )
    except FaceMapMismatchError as error:
        return ConvertedComponent(glb_name, component.name, component.nodes, None, str(error))
    (output_dir / face_file_name).write_text(
        json.dumps(face_file.to_json(_WRITER), separators=(",", ":")), encoding="utf-8"
    )
    return ConvertedComponent(glb_name, component.name, component.nodes, face_file_name, None)


def _visible_components(components: list[LeafComponent]) -> list[LeafComponent]:
    """Keep the components that have faces to draw, and require at least one solid.

    Wires, points and construction geometry would give empty meshes. A file
    with surfaces but no solid at all is most likely a wrong export setting.
    """
    if not any(count_subshapes(component.shape, TopAbs_SOLID) for component in components):
        raise UnusableStepFileError(
            "The STEP file contains no solid body. "
            "Export the model with its solids (not only wireframe or surfaces)."
        )
    return [component for component in components if count_subshapes(component.shape, TopAbs_FACE)]
